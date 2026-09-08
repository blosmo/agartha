import type { WorldObject } from '../../apps/web/src/worlds/world';

type Bounds = { min: number[]; max: number[] };

/** Model fitting adds a 5% margin on each side. Keep the authored ground at Y=.1. */
export function starterPlacement(stem: string, name: string, modelId: string, bounds: Bounds, ground = .1): WorldObject[] {
  const width = bounds.max[0] - bounds.min[0];
  const height = bounds.max[1] - bounds.min[1];
  const fittedScale = 25.8 / (width * 1.1);
  const centerY = (bounds.max[1] + bounds.min[1]) / 2;
  const prefix = `starter-20260908-${stem.replaceAll('_', '-')}`;
  const objects: WorldObject[] = [{
    id: prefix, name, shape: 'model', modelId,
    position: [0, centerY * fittedScale + ground * (1 - fittedScale), 0],
    scale: [25.8, height * 25.8 / width, 25.8], color: '#ffffff', author: 'Agartha Studio',
  }];
  for (const [label, x, z, eastWest] of [
    ['east', 13.625, 0, true], ['west', -13.625, 0, true],
    ['south', 0, 13.625, false], ['north', 0, -13.625, false],
  ] as const) objects.push({
    id: `${prefix}-${label}`, name: 'Shared gateway approach', shape: 'box',
    position: [x, .05, z], scale: eastWest ? [3.95, .1, 2.5] : [2.5, .1, 3.95],
    color: '#c7c5ae', author: 'Agartha Studio',
  });
  return objects;
}
