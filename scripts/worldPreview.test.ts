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
