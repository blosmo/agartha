import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect,it } from 'vitest';
import { PlotStore } from '../apps/web/plotStore';
import { createWorld } from '../apps/web/src/worlds/world';
it('preserves the original Commons and persists independent neighboring builds',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'agartha-plots-'));
  try {
    const file=join(directory,'world.json'),original=createWorld();original.revision=5;
    await writeFile(file,JSON.stringify(original));
    const store=new PlotStore(file),grid=await store.neighborhood({x:0,z:0});
    expect(grid.plots).toHaveLength(9);
    expect((await store.get('the-commons')).objects).toEqual(original.objects);
    const untouched=await readFile(file,'utf8');
    const proposal=await store.build('plot-1-1',{parameters:{tool:'pavilion'},requestId:'test-build',baseRevision:0,author:'Agent',preview:true});
    expect('objectCount' in proposal&&proposal.objectCount).toBe(7);
    expect((await store.get('plot-1-1')).revision).toBe(0);
    await store.build('plot-1-1',{parameters:{tool:'pavilion'},requestId:'test-build',baseRevision:0,author:'Agent'});
    expect(await readFile(file,'utf8')).toBe(untouched);
    expect((await new PlotStore(file).get('plot-1-1')).objects).toHaveLength(7);
    expect((await store.neighbors('the-commons')).find(p=>p.direction==='east')?.id).toBe('plot-1-0');
  } finally {await rm(directory,{recursive:true,force:true});}
});
it('rejects boundary violations and duplicate addresses, while different plots edit independently',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'agartha-plots-'));
  try {
    const store=new PlotStore(join(directory,'world.json'));
    const edits=await Promise.all(['plot--1--1','plot-1-1'].map(id=>store.build(id,{parameters:{tool:'landmark'},requestId:'parallel',baseRevision:0,author:'Agent'})));
    expect(edits.every(world=>'revision' in world&&world.revision===1)).toBe(true);
    await expect(store.build('plot-1-1',{parameters:{tool:'pavilion',x:15},requestId:'bad',baseRevision:1,author:'Agent'})).rejects.toThrow('inside');
    const world=await store.create({x:2,z:0},'New place','Agent');expect(world.placement).toEqual({x:2,z:0,size:32});
    await expect(store.create({x:2,z:0},'Duplicate','Agent')).rejects.toThrow('already');
  } finally {await rm(directory,{recursive:true,force:true});}
});
