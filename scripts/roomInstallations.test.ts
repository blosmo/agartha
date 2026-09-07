import { expect, it } from 'vitest';
import { INSTALLATION_SURFACES, roomInstallations } from './roomInstallations';
import { compileSurface } from '../packages/protocol/src/surfaceShaders';
import { assertWithinPlot } from '../packages/protocol/src/plots';
import { applyWorldEdit, createWorld } from '../apps/web/src/worlds/world';

it('accepts the full motion bounds of every installation through the real edit validator', () => {
  for (const room of roomInstallations({water:`shader-${'1'.repeat(64)}`,light:`shader-${'2'.repeat(64)}`,crystal:`shader-${'3'.repeat(64)}`})) {
    room.objects.forEach(object=>assertWithinPlot(object));
    const world = {...createWorld(),id:room.id,placement:{x:1,z:1,size:32 as const}};
    const edited = applyWorldEdit(world,{baseRevision:world.revision,author:'Codex',message:'Install room motion',objects:room.objects});
    expect(edited.objects.filter(object=>object.motion).length).toBeGreaterThan(0);
  }
});
it('compiles all room surfaces as animated GLSL and WGSL', () => {
  for (const surface of Object.values(INSTALLATION_SURFACES)) expect(compileSurface(surface.expression).usesTime).toBe(true);
});
