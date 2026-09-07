import type {ModelAnimation} from './modelAssets';
import {MESH_LIMITS} from './geometry/mesh';
import { MATERIAL_CATALOG } from './materials';
import type { ObjectMotion } from './objectMotion';
import { SURFACE_CAPABILITIES } from './surfaceShaders';
import { assertWithinPlot } from './plots';
export type BuildShape = 'box' | 'sphere' | 'cone' | 'cylinder' | 'mesh' | 'model';
export type BuildObject = { id: string; name: string; shape: BuildShape; position: [number, number, number]; scale: [number, number, number]; color: string; yaw?: number; motion?: ObjectMotion; materialId?: string; meshId?:string;modelId?:string;animation?:ModelAnimation };
export const BUILDER_TOOLS = [
  { id: 'terrain', name: 'Terrain', description: 'Sculpt a patch of terraced hills.', maxObjects: 16 },
  { id: 'grove', name: 'Grove', description: 'Plant a varied cluster of trees.', maxObjects: 16 },
  { id: 'pavilion', name: 'Pavilion', description: 'Build an open gathering place.', maxObjects: 8 },
  { id: 'path', name: 'Path', description: 'Lay a gently curving stone path.', maxObjects: 16 },
  { id: 'landmark', name: 'Landmark', description: 'Create a tiered sculptural beacon.', maxObjects: 5 },
] as const;
export type BuilderTool = typeof BUILDER_TOOLS[number]['id'];
export const BUILD_PALETTES = {
  woodland: { land: '#7c9470', foliage: '#547b65', accent: '#c4b394', trunk: '#82715a', light: '#f1d69d' },
  sandstone: { land: '#b89d79', foliage: '#9f9267', accent: '#d3b78c', trunk: '#896957', light: '#edc681' },
  moonlight: { land: '#798b9b', foliage: '#678787', accent: '#c0c8cc', trunk: '#616e7e', light: '#c9e1dd' },
} as const;
export type BuildParameters = { tool: BuilderTool; x?: number; y?: number; z?: number; heading?: number; size?: number; seed?: number; palette?: keyof typeof BUILD_PALETTES };
export function parseBuildParameters(value: unknown): Required<BuildParameters> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected builder parameters.');
  const input = value as Record<string, unknown>;
  const tool = BUILDER_TOOLS.find(t => t.id === input.tool);
  if (!tool) throw new Error('Unknown builder tool.');
  const number = (key: string, fallback: number, min: number, max: number) => {
    const n = input[key] ?? fallback;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new Error(`${key} must be between ${min} and ${max}.`);
    return n;
  };
  const palette = input.palette ?? 'woodland';
  if (typeof palette !== 'string' || !Object.hasOwn(BUILD_PALETTES, palette)) throw new Error('Unknown palette.');
  const seed = number('seed', 1, 0, 2147483647);
  if (!Number.isInteger(seed)) throw new Error('Seed must be an integer.');
  return { tool: tool.id, x: number('x', 0, -15, 15), z: number('z', 0, -15, 15), y: number('y', 0, -4, 30), heading: number('heading', 0, 0, 360), size: number('size', 4, 2, 10), seed, palette: palette as keyof typeof BUILD_PALETTES };
}
export function generateBuild(value: unknown, idPrefix: string) {
  if (typeof idPrefix !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(idPrefix)) throw new Error('Builder IDs need a unique 1–64 character prefix.');
  const parameters = parseBuildParameters(value), { tool, x, y, z, heading, size, seed, palette } = parameters;
  const colors = BUILD_PALETTES[palette];
  let randomState = seed >>> 0;
  const random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
  const objects: BuildObject[] = [];
  const add = (name: string, shape: BuildShape, position: BuildObject['position'], scale: BuildObject['scale'], color: string) => {
    const yaw = heading * Math.PI / 180, dx = position[0] - x, dz = position[2] - z;
    const placed: BuildObject['position'] = [x + Math.cos(yaw) * dx + Math.sin(yaw) * dz, position[1] + y, z - Math.sin(yaw) * dx + Math.cos(yaw) * dz];
    const object = { id: `${idPrefix}-${objects.length}`, name, shape, position: placed, scale, color, yaw };
    assertWithinPlot(object); objects.push(object);
  };
  if (tool === 'terrain') {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const height = .3 + random() * size * .35;
      add('Terraced earth', 'box', [x + (i - 1.5) * size / 2, height / 2 - .2, z + (j - 1.5) * size / 2], [size / 2 + .05, height, size / 2 + .05], colors.land);
    }
  } else if (tool === 'grove') {
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI * .764, radius = Math.sqrt((i + .5) / 8) * size;
      const px = x + Math.cos(angle) * radius, pz = z + Math.sin(angle) * radius;
      const height = 2.5 + random() * 2;
      add('Tree trunk', 'cylinder', [px, height * .23 - .2, pz], [.3, height * .46, .3], colors.trunk);
      add('Tree canopy', i % 3 ? 'cone' : 'sphere', [px, height * .65, pz], [1.7, height, 1.7], i % 2 ? colors.foliage : colors.land);
    }
  } else if (tool === 'pavilion') {
    add('Pavilion terrace', 'box', [x, .05, z], [size * 1.4, .5, size * 1.4], colors.accent);
    for (const [dx, dz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) add('Pavilion column', 'cylinder', [x + dx * size * .52, 1.8, z + dz * size * .52], [.32, 3.1, .32], colors.accent);
    add('Pavilion roof', 'cone', [x, 4, z], [size * 2, 1.6, size * 2], colors.trunk);
    add('Gathering table', 'cylinder', [x, .8, z], [size * .42, 1, size * .42], colors.trunk);
  } else if (tool === 'path') {
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      add('Path stone', 'box', [x + (t - .5) * size * 2, -.05, z + Math.sin(t * Math.PI * 2) * size * .15], [size / 7, .3, .7], colors.accent);
    }
  } else {
    add('Landmark plinth', 'cylinder', [x, .1, z], [size, .6, size], colors.accent);
    add('Landmark column', 'box', [x, size * .4 + .4, z], [size * .32, size * .8, size * .32], colors.trunk);
    add('Beacon crown', 'sphere', [x, size * .8 + .65, z], [size * .65, size * .65, size * .65], colors.light);
    add('Landmark step', 'box', [x, -.05, z + size * .7], [size * .7, .3, size * .35], colors.accent);
  }
  return { parameters, objects, summary: `Created ${BUILDER_TOOLS.find(t => t.id === tool)!.name.toLowerCase()} with ${objects.length} objects`, objectCount: objects.length };
}
export const BUILDER_CATALOG = {
  meshes: {publish:'/api/library',kind:'mesh',modeling:{lathe:'profile: radius/height pairs, segments: 3–96, capStart/capEnd: boolean',extrude:'outline: simple XZ polygon, depth: 0.1–60'},inputs:['recipe: lathe or extrude','geometry: indexed positions, indices, optional normals and uvs','obj: triangulated OBJ text'],place:'Use shape: mesh and the returned meshId on a room object. Scale gives full XYZ dimensions.',limits:MESH_LIMITS,guide:'/agents/modeling.md'},
  visualReview: {designGuide:'/agents/design.md',reviewGuide:'/agents/visual-review.md',roomPreview:'/api/plots/PLOT_ID/preview',gridPreview:'/api/plots/PLOT_ID/preview?scope=grid',completion:'Read saved work, open and inspect its rendered image, identify concrete visual defects, revise owned objects and render again. Report unverified appearance when image viewing is unavailable.'},
  materials: {path:'/api/materials',count:MATERIAL_CATALOG.entries.length,apply:MATERIAL_CATALOG.apply},
  motion: { kinds: ['float','spin'], speed: '0.05–2 radians per second', amplitude: 'Float only: 0.1–2 world units', phase: '0–2π radians', behavior: 'Optional object.motion; full movement stays within plot bounds. Reduced motion freezes playback; PNG previews use time=0.' },
  tools: BUILDER_TOOLS,
  library: {assetParts:100,immutable:true,operations:['publish asset','publish shader','prepare placement','place editable copy','apply shader by ID'],surfaces:SURFACE_CAPABILITIES},
  parameters: { tool: 'Required tool ID', x: 'Local X (-15 to 15), default 0', z: 'Local Z (-15 to 15), default 0', y: 'Elevation (-4 to 30), default 0', heading: 'Facing in degrees (0 to 360), default 0', size: '2 to 10, default 4', seed: 'Integer 0–2147483647, default 1', palette: Object.keys(BUILD_PALETTES) },
  behavior: 'Recipes create editable primitives. Preview first; complete object bounds must fit inside the plot. Objects can be customized through the raw edit API.',
};
