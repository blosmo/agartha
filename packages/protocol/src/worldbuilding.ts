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
  meshes: {
    publish:'/api/library',kind:'mesh',
    modeling:{
      lathe:'profile: radius/height pairs, segments: 3–96, capStart/capEnd: boolean; smooth: boolean (default false); steps: 1–8 (default 4 when smooth, otherwise 1); at most 256 rings',
      extrude:'outline: simple XZ polygon, depth: 0.1–60',
      roundedBox:'size: positive XYZ up to 60; radius and remaining inner half-extents: at least 0.0001; segments: 1–8 (default 3)',
      torus:'radius: >0 up to 30; tube: 0.0001–10; radius-minus-tube at least 0.0001; segments/tubeSegments: 3–128 (defaults 32/12), subject to mesh budgets',
      sweep:'path: 2–128 XYZ points within ±30; radius: 0.0001–10; path/ring spacing at least 0.0001; segments: 3–32 (default 12); steps: 1–8 (default 1), at most 256 rings; smooth: false; capStart/capEnd: true',
      transform:'Optional on every recipe: scale XYZ 0.01–100, then rotation XYZ in degrees (-360..360), applied X then Y then Z. Use returned bounds for proportionate placement.',
    },
    inputs:['recipe: lathe, extrude, roundedBox, torus, or sweep','geometry: indexed positions, indices, optional normals and uvs','obj: triangulated OBJ text'],
    place:'Use shape: mesh and the returned meshId on a room object. Scale gives full XYZ dimensions.',
    limits:MESH_LIMITS,guide:'/agents/modeling.md',
  },
  visualReview: {
    views:['isometric','front','side','top'],
    viewQuery:'Use view=NAME on preview endpoints; combine with time and focus. Focus may list up to 20 object IDs. Focused orthographic views isolate those parts; isometric stays contextual.',
    designGuide:'/agents/design.md',reviewGuide:'/agents/visual-review.md',roomPreview:'/api/plots/PLOT_ID/preview',gridPreview:'/api/plots/PLOT_ID/preview?scope=grid',
    completion:'Read saved work, open and inspect its rendered image, identify concrete visual defects, revise owned objects and render again. Report unverified appearance when image viewing is unavailable.',
  },
  materials: {path:'/api/materials',count:MATERIAL_CATALOG.entries.length,apply:MATERIAL_CATALOG.apply},
  environment: { endpoint: 'POST /api/plots/ROOM_ID', presets: ['daylight','golden-hour','moonlit'], fields: { exposure: '0.4–1.6', haze: '0–1', bloom: '0–0.5', sunAzimuth: '-180–180 degrees', sunElevation: '10–85 degrees' }, behavior: 'Environment writes are separate from geometry, use expectedEnvironmentVersion, and require creator/curator authorization. Omit the environment or send null to restore the default active-room mood.' },
  motion: { kinds: ['float','spin','path'], speed: 'Float/spin: 0.05–2; path: 0.05–5 world units per second', amplitude: 'Float only: 0.1–2 world units', phase: '0–2π radians; path phase is a normalized fraction of its complete loop or pingpong cycle', path: 'points: 2–32 relative XYZ waypoints, horizontal ±24 and vertical ±8; mode: loop or pingpong; orient: boolean default true', behavior: 'Optional object.motion; moving models stay separate from static architecture and their complete swept envelope must fit the room and gateways. Reduced motion freezes deterministic initial state; PNG previews use the requested time but may approximate browser lighting.' },
  tools: BUILDER_TOOLS,
  library: {assetParts:100,immutable:true,operations:['publish mesh','publish asset','publish shader','prepare placement','place editable copy','apply shader by ID'],surfaces:SURFACE_CAPABILITIES},
  parameters: { tool: 'Required tool ID', x: 'Local X (-15 to 15), default 0', z: 'Local Z (-15 to 15), default 0', y: 'Elevation (-4 to 30), default 0', heading: 'Facing in degrees (0 to 360), default 0', size: '2 to 10, default 4', seed: 'Integer 0–2147483647, default 1', palette: Object.keys(BUILD_PALETTES) },
  behavior: 'Builders create editable primitives; modeling recipes publish reusable meshes. Preview first; complete object bounds must fit inside the plot. Objects can be customized through the raw edit API.',
};
