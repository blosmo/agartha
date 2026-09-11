import { assertWithinPlot } from '../../packages/protocol/src/plots';
import { parseObjectMotion } from '../../packages/protocol/src/objectMotion';
import { parseRoomEnvironment } from '../../packages/protocol/src/roomEnvironment';
import { MODEL_ID } from '../../packages/protocol/src/modelAssets';
import type { BuildObject } from '../../packages/protocol/src/worldbuilding';

export const LUMEN_NAME = 'Lumen Garden Station';
export const LUMEN_BRIEF = 'A quiet garden station after rain: warm limestone, a terrace cafe, living planting, reflecting water and a bronze orbital lantern. A small transit pod circles the garden while four open approaches connect the surrounding rooms.';
export const LUMEN_ENVIRONMENT = parseRoomEnvironment({ preset: 'golden-hour', exposure: .9, haze: 0, bloom: .12, sunAzimuth: -85, sunElevation: 40 })!;
export type LumenComponent = { name: string; position: number[]; scale: number[] };

/** The model files stay local; this manifest contains only bounded, portable scene data. */
export function lumenObjects(components: readonly LumenComponent[], modelIds: Readonly<Record<string, string>>, water?: { modelId: string; clip: string }): BuildObject[] {
  if (components.length > 16 || new Set(components.map(part => part.name)).size !== components.length) throw new Error('Use at most 16 distinct Lumen components.');
  const objects = components.map(part => {
    if (!/^[a-z][a-z-]{0,40}$/.test(part.name) || !MODEL_ID.test(modelIds[part.name] ?? '')) throw new Error('Invalid Lumen component or model reference.');
    const object: BuildObject = { id: `lumen-${part.name}`, name: `${LUMEN_NAME}: ${part.name.replaceAll('-', ' ')}`, shape: 'model', modelId: modelIds[part.name], position: [...part.position] as [number, number, number], scale: [...part.scale] as [number, number, number], color: '#ffffff' };
    if (part.name === 'pod') {
      object.position = [0, part.position[1] - .15, 0];
      object.motion = parseObjectMotion({ kind: 'path', points: Array.from({ length: 32 }, (_, i) => { const angle = i * Math.PI / 16; return [8 * Math.sin(angle), 0, 8 * Math.cos(angle)]; }), speed: .7, mode: 'loop', orient: true });
    }
    if (part.name === 'orbital-rings') {
      object.position[0] = 0; object.position[2] = 0;
      object.motion = parseObjectMotion({ kind: 'spin', speed: .16 });
    }
    assertWithinPlot(object);
    return object;
  });
  if (water) {
    if (!MODEL_ID.test(water.modelId) || !water.clip || water.clip.length > 80) throw new Error('Invalid animated water.');
    const object: BuildObject = { id: 'lumen-water', name: 'Reflecting water current', shape: 'model', modelId: water.modelId, position: [0, .76, 0], scale: [7, .1, 7], color: '#ffffff', animation: { clip: water.clip, speed: 1, paused: false } };
    assertWithinPlot(object); objects.push(object);
  }
  return objects;
}
