import { PlaygroundStore } from './playgroundStore';
import { playgroundHandler } from './playgroundServer';
import { CHAT_CAPABILITIES } from '../../packages/protocol/src/chat';
import { ChatStore } from './chatStore';
import { chatHandler } from './chatServer';
import { installStarterCatalog } from './starterCatalog';
import {MODEL_CAPABILITIES} from '../../packages/protocol/src/modelAssets';
import {ModelStore} from './modelStore';
import {modelHandler} from './modelServer';
import { MATERIAL_CATALOG } from '../../packages/protocol/src/materials';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILDER_CATALOG } from '../../packages/protocol/src/worldbuilding';
import { addressFromId } from '../../packages/protocol/src/plots';
import { compileSurface } from '../../packages/protocol/src/surfaceShaders';
import { instantiateAsset } from '../../packages/protocol/src/sharedLibrary';
import { LibraryStore } from './libraryStore';
import { plotPreviewSnapshot } from './plotPreview';
import { PlotStore } from './plotStore';
import { createWorldPreview } from './worldPreview';
import { WorldError } from './src/worlds/world';
import {parsePreviewView} from '../../packages/protocol/src/previewView';
import {canonicalPreviewFocus,selectPreviewFocus} from '../../packages/protocol/src/previewFocus';

export function plotSpacePlugin(originFile: string): Plugin {
  const handleChat = chatHandler(new ChatStore(resolve(dirname(originFile), 'chat.json')));
  const models=new ModelStore(resolve(dirname(originFile),'models'));
  const handleModels=modelHandler(models);
  const library = new LibraryStore(resolve(dirname(originFile), 'library'),id=>models.get(id));
  const store = new PlotStore(originFile,(next,previous)=>library.validateScene(next,previous),()=>installStarterCatalog(models));
  const handlePlayground = playgroundHandler(new PlaygroundStore(resolve(dirname(originFile), 'playground.json'), id=>store.get(id)));
  const worker = resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/renderer/render.ts');
  const preview = createWorldPreview(worker,id=>models.content(id));
  async function handle(req: IncomingMessage, res: ServerResponse, legacy = false, isLibrary = false) {
    res.setHeader('Content-Type', 'application/json');res.setHeader('Cache-Control', 'no-store');
    try {
      const host = req.headers.host ?? '';
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) || (req.headers.origin && req.headers.origin !== `http://${host}`)) throw new WorldError('Local access only', 403);
      if (!['GET','POST'].includes(req.method ?? '')) throw new WorldError('Method not allowed',405);
      const url = new URL(req.url ?? '/', `http://${host}`);
      const segments = url.pathname.split('/').filter(Boolean);
      const id = legacy ? 'the-commons' : segments[0];
      const action = legacy ? segments[0] : segments[1];
      if (!isLibrary && !legacy && ['proposals','owners','proposal-events'].includes(action)) throw new WorldError('Room collaboration requires the authenticated cloud API. The file-backed local server does not provide agent ownership.',501);
      if ((!legacy && segments.length > 2) || (legacy && segments.length > 1)) throw new WorldError('Not found',404);
      let input: Record<string, unknown> = {};
      if (req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) throw new WorldError('Use application/json',415);
        let raw = '';for await (const chunk of req) { raw += chunk.toString(); if (Buffer.byteLength(raw) > (isLibrary ? 4_000_000 : 65536)) throw new WorldError('Request exceeds the endpoint byte limit',413); }
        try { input = JSON.parse(raw); if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(); } catch { throw new WorldError('Expected a JSON object'); }
      }
      if (isLibrary) {
        if(segments.length>1)throw new WorldError('Not found',404);
        if(req.method==='POST'&&segments.length)throw new WorldError('Library entries are immutable.',405);
        if (req.method === 'GET') {
          const entry=segments[0]?await library.get(segments[0]):undefined;
          res.end(JSON.stringify(entry ? {...entry,...(entry.kind==='shader'?{wgsl:compileSurface(entry.expression).wgsl,glsl:compileSurface(entry.expression).glsl}:{})} : await library.list(url.searchParams.get('kind') ?? undefined,url.searchParams.get('cursor') ?? undefined)));
        }
        else { try{addressFromId(input.plotId as string);}catch{throw new WorldError('Choose a source plot.');} await store.get(input.plotId as string); res.end(JSON.stringify(await library.publish(input.definition,input.author as string))); }
        return;
      }
      if (!id) {
        const result = req.method === 'GET' ? await store.neighborhood({x:Number(url.searchParams.get('x') ?? 0),z:Number(url.searchParams.get('z') ?? 0)},Number(url.searchParams.get('radius')??1)) : await store.create({x:Number(input.x),z:Number(input.z)},input.name as string,input.author as string);
        res.end(JSON.stringify('plots' in result ? {...result,plots:await Promise.all(result.plots.map(world=>library.enrich(world)))} : await library.enrich(result)));return;
      }
      try { addressFromId(id); } catch { throw new WorldError('Invalid plot address.'); }
      if (action === 'tools') {
        if (req.method === 'GET') res.end(JSON.stringify({...BUILDER_CATALOG,models:MODEL_CAPABILITIES,chat:CHAT_CAPABILITIES}));
        else { const result=await store.build(id,input as unknown as Parameters<PlotStore['build']>[1]);res.end(JSON.stringify('schema' in result?await library.enrich(result):result)); }
      } else if (action === 'assets' && req.method === 'POST') {
        if(typeof input.preview!=='boolean')throw new WorldError('Choose preview true or false explicitly.');
        const asset = await library.get(input.assetId as string);
        if (asset.kind !== 'asset') throw new WorldError('Choose a reusable asset.');
        let objects;try { objects = instantiateAsset(asset, input.parameters ?? {}, input.requestId as string); } catch(error) { throw new WorldError(error instanceof Error ? error.message : 'Invalid placement.'); }
        await library.validateReferences(objects);
        if (input.preview === true) res.end(JSON.stringify({objects,objectCount:objects.length,baseRevision:(await store.get(id)).revision,assetId:asset.id}));
        else res.end(JSON.stringify(await library.enrich(await store.addObjects(id,objects,input.baseRevision as number,input.author as string,`Placed shared asset: ${asset.name}`))));
      } else if (action === 'neighbors' && req.method === 'GET') res.end(JSON.stringify(await store.neighbors(id)));
      else if (action === 'traverse' && req.method === 'POST') {
        const neighbors = await store.neighbors(id);const neighbor = neighbors.find(n => n.direction === input.direction);
        if (!neighbor) throw new WorldError('Choose an available cardinal gateway.');
        if (!neighbor.exists) throw new WorldError('This neighboring plot has not been started yet.',404);
        res.end(JSON.stringify({ gateway: { from:id,to:neighbor.id,direction:neighbor.direction,permeable:true }, world:await library.enrich(await store.get(neighbor.id)), permissions:'Traversal does not grant write access in hosted worlds.' }));
      } else if (action === 'preview' && req.method === 'GET') {
        let view;try{view=parsePreviewView(url.searchParams.get('view'));}catch(error){throw new WorldError(error instanceof Error?error.message:'Invalid preview view.');}
        let focusId;try{focusId=canonicalPreviewFocus(url.searchParams.get('focus'));}catch(error){throw new WorldError(error instanceof Error?error.message:'Invalid preview focus.');}
        const world = await store.get(id);
        let focusObjects;try{focusObjects=selectPreviewFocus(world.objects,focusId);}catch(error){throw new WorldError(error instanceof Error?error.message:'Invalid preview focus.',404);}
        const grid = url.searchParams.get('scope') === 'grid' ? await store.neighborhood(addressFromId(id)) : undefined;
        const candidates = view!=='isometric'&&focusObjects?[{...world,objects:focusObjects}]:grid ? [...grid.plots,...grid.empty.map(address=>({schema:1 as const,id:address.id,name:'Open ground',brief:'',revision:-1,objects:[],events:[],placement:{x:address.x,z:address.z,size:32 as const}}))] : [world];
        const worlds = await Promise.all(candidates.map(plot=>library.enrich(plot,true)));
        const previewTime=Number(url.searchParams.get('time')??0);if(!Number.isFinite(previewTime)||previewTime<0||previewTime>120)throw new WorldError('Preview time must be 0–120 seconds.');
        const rendered = plotPreviewSnapshot(worlds, world,previewTime,focusId,view);
        try { const png = await preview(rendered.snapshot);res.setHeader('X-Agartha-Snapshot',rendered.digest);res.setHeader('Content-Type','image/png');res.setHeader('X-Agartha-Revision',String(world.revision));res.setHeader('X-Agartha-Plot',id);res.setHeader('X-Agartha-Renderer','vgpu');res.setHeader('X-Agartha-Preview-Time',String(previewTime));res.setHeader('X-Agartha-Preview-View',view);res.end(png); }
        catch (error) { throw new WorldError(error instanceof Error ? error.message : 'Preview failed',503); }
      } else if (!action) {
        if (req.method === 'POST' && Array.isArray(input.objects)) await library.validateReferences(input.objects as Array<{shaderId?:string}>);
        res.end(JSON.stringify(await library.enrich(req.method === 'GET' ? await store.get(id) : await store.edit(id,input))));
      }
      else throw new WorldError('Not found',404);
    } catch (error) {
      res.statusCode = error instanceof WorldError ? error.status : 500;
      res.end(JSON.stringify({error:error instanceof Error && res.statusCode !== 500 ? error.message : 'Unable to access the shared plots'}));
    }
  }
  const mount = (server: { middlewares: { use: (path: string, callback: (req: IncomingMessage,res:ServerResponse)=>void) => void } }) => {
    server.middlewares.use('/api/playground',(req,res)=>{void handlePlayground(req,res);});
    server.middlewares.use('/api/session',(req,res)=>{void handlePlayground(req,res,true);});
    server.middlewares.use('/api/chat',(req,res)=>{void handleChat(req,res);});
    server.middlewares.use('/api/governance',(_req,res)=>{res.statusCode=501;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({supported:false,error:'Governance requires the authenticated hosted API. This file-backed world does not support voting.',guide:'/agents/governance.md'}));});
    server.middlewares.use('/api/models',(req,res)=>{void handleModels(req,res);});
    server.middlewares.use('/api/materials',(req,res)=>{res.setHeader('Content-Type','application/json');if(new URL(req.url??'/','http://local').pathname!=='/'){res.statusCode=501;res.end(JSON.stringify({error:'Persistent material contributions require the authenticated hosted API.',guide:'/agents/material-authoring.md'}));return;}if(req.method!=='GET'){res.statusCode=405;res.end(JSON.stringify({error:'Read-only material catalog'}));return;}res.end(JSON.stringify(MATERIAL_CATALOG));});
    server.middlewares.use('/api/library',(req,res)=>{void handle(req,res,false,true);});
    server.middlewares.use('/api/plots',(req,res)=>{void handle(req,res);});
    server.middlewares.use('/api/world',(req,res)=>{void handle(req,res,true);});
  };
  return {name:'agartha-connected-plots',configureServer:mount,configurePreviewServer:mount};
}
