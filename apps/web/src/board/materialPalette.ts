import { MATERIAL, type MaterialId } from "@agartha/protocol/world";

import { DEFAULT_PAINT_SWATCHES, type PaintSwatch } from "../app/demoWorld";

export const MATERIAL_PALETTE: Record<MaterialId, [number, number, number, number]> = {
  [MATERIAL.Empty]: [12, 14, 18, 255],
  [MATERIAL.Paint]: [95, 170, 255, 255],
  [MATERIAL.Stone]: [126, 132, 142, 255],
  [MATERIAL.Water]: [48, 122, 210, 255],
  [MATERIAL.Fire]: [230, 82, 42, 255],
  [MATERIAL.Plant]: [79, 164, 91, 255],
};

export function materialColor(
  material: MaterialId,
  variant = 0,
  paintSwatches: readonly PaintSwatch[] = DEFAULT_PAINT_SWATCHES,
): [number, number, number, number] {
  if (material === MATERIAL.Paint) {
    return hexToRgba(paintSwatches[variant % paintSwatches.length]?.color ?? DEFAULT_PAINT_SWATCHES[0].color);
  }

  return MATERIAL_PALETTE[material];
}

function hexToRgba(hex: string): [number, number, number, number] {
  const normalized = hex.replace("#", "");
  if (!/^[\da-f]{6}$/i.test(normalized)) return MATERIAL_PALETTE[MATERIAL.Paint];

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
    255,
  ];
}
