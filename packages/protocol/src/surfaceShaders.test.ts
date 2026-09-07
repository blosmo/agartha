import {expect,it} from 'vitest';
import {compileSurface,SURFACE_EXAMPLES} from './surfaceShaders';
it.each(SURFACE_EXAMPLES)('compiles $name into both surface backends',example=>{
  const compiled=compileSurface(example.expression);expect(compiled.wgsl).toContain('fn agarthaShade');expect(compiled.glsl).toContain('vec3 agarthaShade');
});
it('types vectors, casts scalar arithmetic, and detects animated shaders',()=>{
  expect(compileSurface('color * 2').wgsl).toContain('vec3f(2.0)');
  expect(compileSurface('vec3f(position.xy, time)').usesTime).toBe(true);
  expect(()=>compileSurface('time')).toThrow('vec3f');
  expect(()=>compileSurface('color + position.xy')).toThrow('sizes');
});
it('rejects executable declarations, unbounded programs and unknown names',()=>{
  for(const source of ['color; loop {}','fetch(color)','vec3f(array[0])','unknown','vec3f(1e99)'])expect(()=>compileSurface(source)).toThrow();
  expect(()=>compileSurface('('.repeat(30)+'color'+')'.repeat(30))).toThrow('nested');
});
