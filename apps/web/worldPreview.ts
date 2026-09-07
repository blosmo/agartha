import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {parsePreviewView,type PreviewView} from '../../packages/protocol/src/previewView.js';
import {canonicalPreviewFocus} from '../../packages/protocol/src/previewFocus.js';
import type { SharedWorld } from './src/worlds/world';

/** One isolated GPU job per local server; identical revisions share the same work. */
export function createWorldPreview(workerPath:string,modelContent?:(id:string)=>Promise<Buffer>){
  let cached:{key:string;png:Buffer}|undefined;
  let active:{key:string;promise:Promise<Buffer>}|undefined;
  return async (world:SharedWorld&{previewTime?:number;focusId?:string;view?:PreviewView})=>{
    const view=parsePreviewView(world.view);
    const focusId=canonicalPreviewFocus(world.focusId);
    const key=`${world.id}:${world.revision}:${world.previewTime??0}:${focusId??''}:${view}`;
    if(cached?.key===key)return cached.png;
    if(active){if(active.key===key)return active.promise;throw new Error('A preview is already rendering. Try again shortly.');}
    const promise=(async()=>{
      const directory=await mkdtemp(join(tmpdir(),'agartha-preview-'));
      try {
        const input=join(directory,'scene.json'),output=join(directory,'preview.png');
        const modelFiles:Record<string,string>={};let modelBytes=0;
        for(const id of new Set(world.objects.flatMap(object=>object.modelId?[object.modelId]:[]))){if(!modelContent)throw new Error('Model content is unavailable for previews.');const bytes=await modelContent(id);modelBytes+=bytes.length;if(modelBytes>32_000_000)throw new Error('Preview model data exceeds 32 MB; inspect a smaller area.');modelFiles[id]=bytes.toString('base64');}
        await writeFile(input,JSON.stringify({objects:world.objects,shaders:world.shaders??[],meshes:world.meshes??[],modelFiles,previewTime:world.previewTime??0,focusId,view}),{mode:0o600});
        await new Promise<void>((resolve,reject)=>{
          const child=spawn(process.execPath,['--import','tsx',workerPath,input,output],{stdio:['ignore','ignore','pipe']});
          let diagnostics='';
          child.stderr.on('data',chunk=>{diagnostics=(diagnostics+chunk.toString()).slice(-4000);});
          const timeout=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Preview rendering timed out.'));},20000);
          child.once('error',error=>{clearTimeout(timeout);reject(error);});
          child.once('close',code=>{clearTimeout(timeout);if(code===0)resolve();else {console.error('Agartha vgpu preview failed:',diagnostics);reject(new Error('Preview rendering is unavailable. Check vgpu doctor on this server.'));}});
        });
        const png=await readFile(output);
        cached={key,png};
        return png;
      } finally {await rm(directory,{recursive:true,force:true});}
    })();
    active={key,promise};
    try{return await promise;}finally{active=undefined;}
  };
}
