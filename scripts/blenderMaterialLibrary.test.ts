import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {MATERIAL_CATALOG} from '../packages/protocol/src/materials';
it('bundles the shared catalog without a second hand-maintained material list',()=>{
 const bundled=JSON.parse(readFileSync('cloud/blender_mcp/material_catalog.json','utf8'));
 const bytes=Buffer.concat(['packages/protocol/src/materials.ts','packages/protocol/src/surfaceShaders.ts'].map(path=>readFileSync(path)));
 expect(bundled.sourceSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
 expect(bundled.entries).toEqual(MATERIAL_CATALOG.entries);
 expect(bundled.blenderFinishes).toEqual(MATERIAL_CATALOG.blenderFinishes);
 for(const finish of bundled.blenderFinishes){
  const base=bundled.entries.find((entry:{id:string})=>entry.id===finish.baseMaterialId);
  expect(base,finish.id+' needs a catalog base').toBeDefined();
  expect(base?.maps?.normal,finish.id+' needs a scanned normal-map base').toBeTypeOf('string');
 }
});
