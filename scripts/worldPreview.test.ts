import { mkdtemp,readFile,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect,it } from 'vitest';
import { createWorldPreview } from '../apps/web/worldPreview';
import { createWorld } from '../apps/web/src/worlds/world';

it('coalesces equal revisions, bounds concurrent work, and caches the completed preview',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'agartha-preview-test-'));
  try {
    const worker=join(dir,'worker.mjs'),count=join(dir,'count');
    await writeFile(worker,`import {writeFile,appendFile} from 'node:fs/promises'; await appendFile(${JSON.stringify(count)},'render\\n'); await new Promise(r=>setTimeout(r,150)); await writeFile(process.argv[3],'test-png');`);
    const preview=createWorldPreview(worker),world=createWorld();
    const first=preview(world),second=preview(world);
    await expect(preview({...world,revision:1})).rejects.toThrow('already rendering');
    expect((await first).toString()).toBe('test-png');
    expect(await second).toEqual(await preview(world));
    expect((await readFile(count,'utf8')).trim().split('\n')).toHaveLength(1);
    await preview({...world,revision:1});
    expect((await readFile(count,'utf8')).trim().split('\n')).toHaveLength(2);
  } finally {await rm(dir,{recursive:true,force:true});}
});

it('threads the view to the renderer and separates local cache entries by view',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'agartha-preview-view-test-'));
  try {
    const worker=join(dir,'worker.mjs'),inputs=join(dir,'inputs');
    await writeFile(worker,`import {readFile,writeFile,appendFile} from 'node:fs/promises'; const scene=JSON.parse(await readFile(process.argv[2],'utf8')); await appendFile(${JSON.stringify(inputs)},scene.view+':'+scene.focusId+'\\n'); await writeFile(process.argv[3],'test-png');`);
    const preview=createWorldPreview(worker),world=createWorld();
    await preview({...world,view:'front',focusId:'pond,island,pond'} as never);
    await preview({...world,view:'front',focusId:'island,pond'} as never);
    await preview({...world,view:'top',focusId:'island,pond'} as never);
    expect((await readFile(inputs,'utf8')).trim().split('\n')).toEqual(['front:island,pond','top:island,pond']);
  } finally {await rm(dir,{recursive:true,force:true});}
});
