import { MATERIAL, toWorldCoord, type MaterialId, type WorldCoord } from "@agartha/protocol/world";

export interface DemoCell {
  readonly id: string;
  readonly coord: WorldCoord;
  readonly material: MaterialId;
  readonly state: number;
  readonly variant: number;
  readonly flags: number;
}

export interface DemoEvent {
  readonly id: string;
  readonly tick: number;
  readonly summary: string;
}

export interface TerrainSeed {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly seed: number;
}

export type ToolMode = "paint" | "brush" | "shape" | "bucket" | "eraser" | "stamp" | "cursor" | "marquee";
export type ShapeMode = "rectangle" | "circle" | "diamond";

export interface MaterialToolSettings {
  readonly mode: ToolMode;
  readonly shapeMode: ShapeMode;
  readonly material: MaterialId;
  readonly paintVariant: number;
  readonly brushSize: number;
  readonly hardness: number;
  readonly opacity: number;
  readonly objectId?: string;
  readonly stampRepeat: number;
  readonly stampStepX: number;
  readonly stampStepY: number;
}

export interface PaintSwatch {
  readonly id: number;
  readonly label: string;
  readonly color: string;
  readonly density: number;
  readonly friction: number;
  readonly flow: number;
  readonly heat: number;
  readonly growth: number;
  readonly emissive: number;
  readonly stability: number;
}

export type NewPaintSwatch = Omit<PaintSwatch, "id">;

export interface CellObjectSample {
  readonly dx: number;
  readonly dy: number;
  readonly material: MaterialId;
  readonly state: number;
  readonly variant: number;
  readonly flags: number;
}

export interface CellObjectTemplate {
  readonly id: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly samples: readonly CellObjectSample[];
}

export interface CellObjectStampPattern {
  readonly repeat: number;
  readonly stepX: number;
  readonly stepY: number;
}

export interface MaterialToolResult {
  readonly cells: DemoCell[];
  readonly affected: number;
  readonly material: MaterialId;
}

export const MATERIAL_TOOL_DEFAULTS: Record<MaterialId, Pick<MaterialToolSettings, "hardness" | "opacity">> = {
  [MATERIAL.Empty]: { hardness: 100, opacity: 100 },
  [MATERIAL.Paint]: { hardness: 72, opacity: 96 },
  [MATERIAL.Stone]: { hardness: 100, opacity: 100 },
  [MATERIAL.Water]: { hardness: 28, opacity: 78 },
  [MATERIAL.Fire]: { hardness: 56, opacity: 88 },
  [MATERIAL.Plant]: { hardness: 42, opacity: 82 },
};

export const DEFAULT_TOOL_SETTINGS: MaterialToolSettings = {
  mode: "paint",
  shapeMode: "rectangle",
  material: MATERIAL.Paint,
  paintVariant: 0,
  brushSize: 3,
  stampRepeat: 1,
  stampStepX: 20,
  stampStepY: 0,
  ...MATERIAL_TOOL_DEFAULTS[MATERIAL.Paint],
};

export const DEFAULT_PAINT_SWATCHES: PaintSwatch[] = [
  { id: 0, label: "Paint 1", color: "#5faaff", density: 45, friction: 40, flow: 16, heat: 0, growth: 0, emissive: 18, stability: 70 },
  { id: 1, label: "Paint 2", color: "#d66bff", density: 38, friction: 34, flow: 28, heat: 8, growth: 0, emissive: 26, stability: 62 },
  { id: 2, label: "Paint 3", color: "#ffd166", density: 52, friction: 44, flow: 10, heat: 18, growth: 0, emissive: 20, stability: 76 },
  { id: 3, label: "Paint 4", color: "#4dd4ac", density: 34, friction: 30, flow: 36, heat: 0, growth: 22, emissive: 12, stability: 58 },
];

export const TERRAIN_SEEDS: TerrainSeed[] = [
  {
    id: "stream-garden",
    label: "Stream Garden",
    description: "Water channels, plant clusters, and a few agent markers.",
    seed: 1843,
  },
  {
    id: "ember-break",
    label: "Ember Break",
    description: "Stone ridges and fire pockets cutting through dry growth.",
    seed: 9021,
  },
  {
    id: "stone-delta",
    label: "Stone Delta",
    description: "Dense rock islands split by branching water paths.",
    seed: 4777,
  },
];

export const DEFAULT_TERRAIN_SEED = TERRAIN_SEEDS[0];
export const DEMO_CANVAS_CELLS = 256;
const MAX_BUCKET_FILL_CELLS = 4096;
export const INITIAL_DEMO_CELLS: DemoCell[] = generateTerrain(DEFAULT_TERRAIN_SEED);

export function generateTerrain(terrainSeed: TerrainSeed): DemoCell[] {
  const random = seededRandom(terrainSeed.seed);
  const cells = new Map<string, DemoCell>();

  function set(x: number, y: number, material: MaterialId, state = 0, variant = 0) {
    const cell = demoCell(x, y, material, state, variant);
    cells.set(cell.id, cell);
  }

  const centerX = DEMO_CANVAS_CELLS / 2 + Math.floor(random() * 20) - 10;
  const centerY = DEMO_CANVAS_CELLS / 2 + Math.floor(random() * 18) - 9;

  for (let x = 88; x <= 184; x += 1) {
    const wave = Math.round(Math.sin((x + terrainSeed.seed) * 0.19) * 4);
    const riverY = centerY + wave + Math.floor(random() * 3) - 1;
    set(x, riverY, MATERIAL.Water);
    if (random() > 0.62) set(x, riverY + 1, MATERIAL.Water);
    if (random() > 0.74) set(x, riverY - 1, MATERIAL.Plant);
  }

  for (let index = 0; index < 220; index += 1) {
    const x = centerX + Math.floor(random() * 116) - 58;
    const y = centerY + Math.floor(random() * 88) - 44;
    const roll = random();

    if (roll < 0.46) {
      set(x, y, MATERIAL.Plant);
    } else if (roll < 0.68) {
      set(x, y, MATERIAL.Stone);
    } else if (roll < 0.83) {
      set(x, y, MATERIAL.Paint, 0, Math.floor(random() * DEFAULT_PAINT_SWATCHES.length));
    } else if (roll < 0.93) {
      set(x, y, MATERIAL.Water);
    } else {
      set(x, y, MATERIAL.Fire, Math.floor(random() * 2));
    }
  }

  if (terrainSeed.id === "ember-break") {
    for (let offset = -36; offset <= 36; offset += 1) {
      set(centerX + offset, centerY + Math.round(offset * 0.35), MATERIAL.Stone);
      if (offset % 12 === 0) set(centerX + offset, centerY - 8, MATERIAL.Fire);
    }
  }

  if (terrainSeed.id === "stone-delta") {
    for (let offset = -40; offset <= 40; offset += 2) {
      set(centerX + offset, centerY + 20 + Math.round(Math.sin(offset) * 4), MATERIAL.Stone);
      set(centerX + offset, centerY - 20 + Math.round(Math.cos(offset) * 4), MATERIAL.Stone);
    }
  }

  set(centerX, centerY, MATERIAL.Paint, 0, 0);
  set(centerX + 1, centerY, MATERIAL.Stone);
  set(centerX + 2, centerY, MATERIAL.Plant);

  return Array.from(cells.values()).sort(compareCells);
}

export function demoCell(x: number, y: number, material: MaterialId, state = 0, variant = 0): DemoCell {
  const coord = toWorldCoord(x, y);
  return {
    id: cellKey(coord),
    coord,
    material,
    state,
    variant,
    flags: 0,
  };
}

export function cellKey(coord: WorldCoord): string {
  const absolute = absoluteCoord(coord);
  return `${absolute.x}:${absolute.y}`;
}

export function absoluteCoord(coord: WorldCoord) {
  return {
    x: coord.chunk.x * 128 + coord.cell.x,
    y: coord.chunk.y * 128 + coord.cell.y,
  };
}

export function upsertCell(cells: readonly DemoCell[], coord: WorldCoord, material: MaterialId): DemoCell[] {
  const key = cellKey(coord);
  const next = new Map(cells.map((cell) => [cell.id, cell]));

  if (material === MATERIAL.Empty) {
    next.delete(key);
  } else {
    next.set(key, {
      id: key,
      coord,
      material,
      state: 0,
      variant: 0,
      flags: 0,
    });
  }

  return Array.from(next.values()).sort(compareCells);
}

export function captureCellObject(
  cells: readonly DemoCell[],
  label: string,
  origin: WorldCoord,
  width: number,
  height: number,
): CellObjectTemplate {
  const originAbsolute = absoluteCoord(origin);
  const boundedWidth = Math.max(1, Math.min(96, Math.round(width)));
  const boundedHeight = Math.max(1, Math.min(96, Math.round(height)));
  const samples = cells
    .map((cell) => {
      const absolute = absoluteCoord(cell.coord);
      return {
        cell,
        dx: absolute.x - originAbsolute.x,
        dy: absolute.y - originAbsolute.y,
      };
    })
    .filter(({ dx, dy }) => dx >= 0 && dy >= 0 && dx < boundedWidth && dy < boundedHeight)
    .map(({ cell, dx, dy }) => ({
      dx,
      dy,
      flags: cell.flags,
      material: cell.material,
      state: cell.state,
      variant: cell.variant,
    }));

  return {
    height: boundedHeight,
    id: normalizeTemplateId(label),
    label: label.trim() || "object",
    samples,
    width: boundedWidth,
  };
}

export function stampCellObject(
  cells: readonly DemoCell[],
  template: CellObjectTemplate,
  origin: WorldCoord,
): { readonly cells: DemoCell[]; readonly affected: number } {
  return stampCellObjectPattern(cells, template, origin, { repeat: 1, stepX: 0, stepY: 0 });
}

export function stampCellObjectPattern(
  cells: readonly DemoCell[],
  template: CellObjectTemplate,
  origin: WorldCoord,
  pattern: CellObjectStampPattern,
): { readonly cells: DemoCell[]; readonly affected: number; readonly placements: number } {
  const originAbsolute = absoluteCoord(origin);
  const repeat = Math.max(1, Math.min(24, Math.round(pattern.repeat)));
  const stepX = Math.max(-96, Math.min(96, Math.round(pattern.stepX)));
  const stepY = Math.max(-96, Math.min(96, Math.round(pattern.stepY)));
  const next = new Map(cells.map((cell) => [cell.id, cell]));
  let affected = 0;

  for (let placement = 0; placement < repeat; placement += 1) {
    const placementX = originAbsolute.x + stepX * placement;
    const placementY = originAbsolute.y + stepY * placement;

    for (const sample of template.samples) {
      const coord = toWorldCoord(placementX + sample.dx, placementY + sample.dy);
      const id = cellKey(coord);
      const current = next.get(id);
      if (
        current?.material === sample.material &&
        current.state === sample.state &&
        current.variant === sample.variant &&
        current.flags === sample.flags
      ) {
        continue;
      }

      next.set(id, {
        coord,
        flags: sample.flags,
        id,
        material: sample.material,
        state: sample.state,
        variant: sample.variant,
      });
      affected += 1;
    }
  }

  return {
    affected,
    cells: Array.from(next.values()).sort(compareCells),
    placements: repeat,
  };
}

export function applyMaterialTool(
  cells: readonly DemoCell[],
  coord: WorldCoord,
  settings: MaterialToolSettings,
): MaterialToolResult {
  const material = settings.mode === "eraser" ? MATERIAL.Empty : settings.material;
  const currentCells = new Map(cells.map((cell) => [cell.id, cell]));
  const targets = toolTargets(currentCells, coord, settings);
  const next = new Map(currentCells);
  let affected = 0;

  targets.forEach((target, index) => {
    if (!shouldApplyTarget(target, coord, settings, index)) return;

    const key = cellKey(target);
    const current = next.get(key);
    if (material === MATERIAL.Empty) {
      if (!current) return;
      next.delete(key);
      affected += 1;
      return;
    }

    const nextVariant = material === MATERIAL.Paint ? settings.paintVariant : coordinateHash(target, 11) % 4;
    if (current?.material === material && current.state === 0 && current.variant === nextVariant) return;
    next.set(key, {
      id: key,
      coord: target,
      material,
      state: material === MATERIAL.Fire ? coordinateHash(target, 5) % 2 : 0,
      variant: nextVariant,
      flags: 0,
    });
    affected += 1;
  });

  return {
    affected,
    cells: Array.from(next.values()).sort(compareCells),
    material,
  };
}

export function stepDemoWorld(cells: readonly DemoCell[]): DemoCell[] {
  const next = new Map(cells.map((cell) => [cell.id, cell]));
  const occupied = new Set(next.keys());

  for (const cell of cells) {
    const { x, y } = absoluteCoord(cell.coord);

    if (cell.material === MATERIAL.Water) {
      const below = toWorldCoord(x, y + 1);
      const belowKey = cellKey(below);
      if (!occupied.has(belowKey)) {
        next.delete(cell.id);
        next.set(belowKey, { ...cell, id: belowKey, coord: below });
        occupied.delete(cell.id);
        occupied.add(belowKey);
      }
    }

    if (cell.material === MATERIAL.Fire) {
      const nextAge = cell.state + 1;
      if (nextAge > 3) {
        next.delete(cell.id);
        occupied.delete(cell.id);
      } else {
        next.set(cell.id, { ...cell, state: nextAge });
      }

      for (const target of [
        toWorldCoord(x + 1, y),
        toWorldCoord(x - 1, y),
        toWorldCoord(x, y + 1),
        toWorldCoord(x, y - 1),
      ]) {
        const targetKey = cellKey(target);
        const targetCell = next.get(targetKey);
        if (targetCell?.material === MATERIAL.Plant) {
          next.set(targetKey, { ...targetCell, material: MATERIAL.Fire, state: 0 });
        }
      }
    }

    if (cell.material === MATERIAL.Plant) {
      const nearWater = [
        toWorldCoord(x + 1, y),
        toWorldCoord(x - 1, y),
        toWorldCoord(x, y + 1),
        toWorldCoord(x, y - 1),
      ].some((coord) => next.get(cellKey(coord))?.material === MATERIAL.Water);

      if (nearWater) {
        const growTarget = toWorldCoord(x + 1, y + 1);
        const growKey = cellKey(growTarget);
        if (!occupied.has(growKey)) {
          next.set(growKey, demoCell(x + 1, y + 1, MATERIAL.Plant));
          occupied.add(growKey);
        }
      }
    }
  }

  return Array.from(next.values()).sort(compareCells);
}

function toolTargets(
  cells: ReadonlyMap<string, DemoCell>,
  coord: WorldCoord,
  settings: MaterialToolSettings,
): WorldCoord[] {
  const { x, y } = absoluteCoord(coord);
  const radius = Math.max(1, Math.min(10, Math.round(settings.brushSize)));

  if (settings.mode === "paint" || settings.mode === "eraser") {
    return [coord];
  }

  if (settings.mode === "bucket") {
    return bucketTargets(cells, coord, radius);
  }

  const targets: WorldCoord[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (
        (settings.mode === "brush" || (settings.mode === "shape" && settings.shapeMode === "circle")) &&
        dx * dx + dy * dy > radius * radius
      ) {
        continue;
      }
      if (settings.mode === "shape" && settings.shapeMode === "diamond" && Math.abs(dx) + Math.abs(dy) > radius) {
        continue;
      }
      targets.push(toWorldCoord(x + dx, y + dy));
    }
  }
  return targets;
}

function bucketTargets(cells: ReadonlyMap<string, DemoCell>, coord: WorldCoord, radius: number): WorldCoord[] {
  const origin = cells.get(cellKey(coord));
  if (!origin) {
    return (
      enclosedEmptyBucketTargets(cells, coord) ??
      toolTargets(cells, coord, { ...DEFAULT_TOOL_SETTINGS, mode: "shape", shapeMode: "circle", brushSize: Math.max(2, radius) })
    );
  }

  const targetMaterial = origin.material;
  const queue = [coord];
  const visited = new Set<string>();
  const targets: WorldCoord[] = [];

  while (queue.length > 0 && targets.length < 220) {
    const nextCoord = queue.shift();
    if (!nextCoord) continue;

    const key = cellKey(nextCoord);
    if (visited.has(key)) continue;
    visited.add(key);

    const cell = cells.get(key);
    if (cell?.material !== targetMaterial) continue;

    targets.push(nextCoord);
    const { x, y } = absoluteCoord(nextCoord);
    queue.push(toWorldCoord(x + 1, y));
    queue.push(toWorldCoord(x - 1, y));
    queue.push(toWorldCoord(x, y + 1));
    queue.push(toWorldCoord(x, y - 1));
  }

  return targets;
}

function enclosedEmptyBucketTargets(cells: ReadonlyMap<string, DemoCell>, coord: WorldCoord): WorldCoord[] | undefined {
  const start = absoluteCoord(coord);
  if (!isWithinDemoCanvas(start.x, start.y)) return undefined;

  const queue = [coord];
  const visited = new Set<string>();
  const targets: WorldCoord[] = [];
  let reachedBoundary = false;

  while (queue.length > 0) {
    const nextCoord = queue.shift();
    if (!nextCoord) continue;

    const key = cellKey(nextCoord);
    if (visited.has(key)) continue;
    visited.add(key);

    const { x, y } = absoluteCoord(nextCoord);
    if (!isWithinDemoCanvas(x, y)) {
      reachedBoundary = true;
      continue;
    }

    if (cells.has(key)) continue;

    targets.push(nextCoord);
    if (targets.length > MAX_BUCKET_FILL_CELLS) return undefined;
    if (x === 0 || y === 0 || x === DEMO_CANVAS_CELLS - 1 || y === DEMO_CANVAS_CELLS - 1) {
      reachedBoundary = true;
    }

    queue.push(toWorldCoord(x + 1, y));
    queue.push(toWorldCoord(x - 1, y));
    queue.push(toWorldCoord(x, y + 1));
    queue.push(toWorldCoord(x, y - 1));
  }

  if (reachedBoundary || targets.length === 0) return undefined;
  return targets;
}

function isWithinDemoCanvas(x: number, y: number) {
  return x >= 0 && y >= 0 && x < DEMO_CANVAS_CELLS && y < DEMO_CANVAS_CELLS;
}

function shouldApplyTarget(
  target: WorldCoord,
  origin: WorldCoord,
  settings: MaterialToolSettings,
  index: number,
) {
  if (settings.mode === "paint" || settings.mode === "bucket" || settings.mode === "eraser") return true;

  const opacity = Math.max(5, Math.min(100, settings.opacity)) / 100;
  const hardness = Math.max(0, Math.min(100, settings.hardness)) / 100;

  if (settings.mode === "shape" && settings.shapeMode === "rectangle") {
    return coordinateHash(target, index) / 100 <= opacity;
  }

  const targetAbsolute = absoluteCoord(target);
  const originAbsolute = absoluteCoord(origin);
  const radius = Math.max(1, Math.min(10, Math.round(settings.brushSize)));
  const distance = Math.hypot(targetAbsolute.x - originAbsolute.x, targetAbsolute.y - originAbsolute.y);
  const falloff = Math.max(0, 1 - distance / (radius + 0.5));
  const coverage = opacity * Math.max(hardness, falloff);

  if (distance <= 0.01) return true;
  return coordinateHash(target, index) / 100 <= coverage;
}

function compareCells(a: DemoCell, b: DemoCell) {
  const absoluteA = absoluteCoord(a.coord);
  const absoluteB = absoluteCoord(b.coord);
  return absoluteA.y - absoluteB.y || absoluteA.x - absoluteB.x;
}

function normalizeTemplateId(label: string) {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "object"
  );
}

function coordinateHash(coord: WorldCoord, salt: number) {
  const { x, y } = absoluteCoord(coord);
  const value = Math.imul(x + 374761393 + salt * 97, 668265263) ^ Math.imul(y + 2246822519, 3266489917);
  return Math.abs(value % 101);
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
