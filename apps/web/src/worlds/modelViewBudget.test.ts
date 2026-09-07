import {expect,it} from 'vitest';
import {inspectGlb} from '../../../../packages/protocol/src/geometry/inspectGlb';
import {glbFixture} from '../../../../packages/protocol/src/geometry/glbFixture';
import {fitsModelResources,fitsModelWork,modelWork} from './modelViewBudget';
const cost=inspectGlb(glbFixture());
it('charges shared buffers and texture bindings once per admitted template',()=>{
 expect(fitsModelResources([{...cost,bytes:16_000_000,texturePixels:8_388_608}],{...cost,bytes:16_000_000,texturePixels:8_388_608})).toBe(true);
 expect(fitsModelResources([{...cost,bytes:16_000_001}],{...cost,bytes:16_000_000})).toBe(false);
 expect(fitsModelResources([{...cost,texturePixels:8_388_609}],{...cost,texturePixels:8_388_608})).toBe(false);
});
it('charges repeated model instances for draw and animation work',()=>{
 const heavy={...cost,triangles:60_000,draws:64};
 expect(fitsModelWork(modelWork(heavy,true),modelWork(heavy,true))).toBe(false);
 expect(fitsModelWork(modelWork(heavy,true),modelWork(heavy,false))).toBe(true);
 expect(fitsModelWork({triangles:1,draws:192,animatedTriangles:0},modelWork(cost,false))).toBe(false);
});
