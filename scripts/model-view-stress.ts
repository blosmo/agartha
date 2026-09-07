import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import type {AddressInfo} from 'node:net';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {plotSpacePlugin} from '../apps/web/plotServer';

// Isolated local fixture: no writes to the user's .agartha world.
const dir=await mkdtemp(join(tmpdir(),'agartha-model-stress-'));
let fixtureModelId='';
const previewModule=resolve('apps/web/__model-preview.tsx');
const fixturePlugin={
 name:'model-preview-fixture',
 resolveId(id:string){if(id==='/__model-preview.tsx')return previewModule;},
 load(id:string){if(id!==previewModule)return;return `
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {WorldViewport} from '/src/worlds/WorldViewport';import '/src/worlds/worldSpace.css';
 const base={id:'saved',name:'Saved fox',shape:'model',modelId:${JSON.stringify(fixtureModelId)},position:[-4,2,0],scale:[4,4,7],color:'#ffffff',author:'Fixture',animation:{clip:'Survey',speed:1,paused:false}};
 const world={schema:1,id:'the-commons',name:'Preview verification',brief:'',revision:0,events:[],objects:[base],placement:{x:0,z:0,size:32}};
 createRoot(document.getElementById('root')).render(<WorldViewport plots={[world]} empty={[]} activePlotId='the-commons' proposal={[{...base,id:'prepared',name:'Prepared fox',position:[4,2,0]}]} onSelect={()=>{}} onVisit={()=>{}}/>);`;},
 configureServer(server:import('vite').ViteDevServer){server.middlewares.use('/__model-preview',(req,res,next)=>{if(req.url!=='/'&&req.url!=='')return next();void server.transformIndexHtml('/__model-preview','<!doctype html><html><head><style>html,body,#root{margin:0;width:100%;height:100%;background:#122021}.world-viewport{position:absolute;inset:0}</style></head><body><div id="root"></div><script type="module" src="/__model-preview.tsx"></script></body></html>').then(html=>{res.setHeader('Content-Type','text/html');res.end(html);});});},
};
const server=await createServer({configFile:false,root:resolve('apps/web'),plugins:[react(),fixturePlugin,plotSpacePlugin(join(dir,'world.json'))],server:{host:'127.0.0.1',port:0},logLevel:'warn'});
await server.listen();
const base=`http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
const bytes=await readFile(new URL('./fixtures/Fox.glb',import.meta.url));
const upload=await fetch(base+'/api/models?name=Fox&author=Stress%20fixture&license=CC0-1.0%20%2F%20CC-BY-4.0&attribution=PixelMannen%3B%20tomkranis%3B%20AsoboStudio%3B%20scurest',{method:'POST',headers:{'Content-Type':'model/gltf-binary'},body:bytes});
if(!upload.ok)throw new Error(await upload.text());const model=await upload.json();fixtureModelId=model.id;
for(const id of ['plot-1-1','plot-2-1']){
 let observed=await fetch(`${base}/api/plots/${id}`);
 if(observed.status===404){const x=Number(id.split('-')[1]);observed=await fetch(base+'/api/plots',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({x,z:1,name:'Model stress fixture',author:'Stress fixture'})});}
 if(!observed.ok)throw new Error(await observed.text());const world=await observed.json();
 const objects=Array.from({length:32},(_,i)=>({id:`fox-${i}`,name:`Fox ${i+1}`,shape:'model',modelId:model.id,position:[-12+(i%8)*3.4,1,-10+Math.floor(i/8)*5.5],scale:[1.6,1.8,3.2],color:'#ffffff',animation:{clip:i%2?'Walk':'Survey',speed:1,paused:false}}));
 const placed=await fetch(`${base}/api/plots/${id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseRevision:world.revision,author:'Stress fixture',message:'Disposable animated model stress fixture',objects})});if(!placed.ok)throw new Error(await placed.text());
}
console.log(JSON.stringify({url:`${base}/?plot=plot-1-1`,previewUrl:base+'/__model-preview',dir,instances:64,expectedAdmitted:32}));
process.on('SIGINT',()=>{void server.close().then(()=>process.exit(0));});
process.on('SIGTERM',()=>{void server.close().then(()=>process.exit(0));});
