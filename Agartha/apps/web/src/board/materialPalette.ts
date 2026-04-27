import { MATERIAL, type MaterialId } from "@agartha/protocol/world";

export const MATERIAL_PALETTE: Record<MaterialId, [number, number, number, number]> = {
  [MATERIAL.Empty]: [12, 14, 18, 255],
  [MATERIAL.Paint]: [95, 170, 255, 255],
  [MATERIAL.Stone]: [126, 132, 142, 255],
  [MATERIAL.Water]: [48, 122, 210, 255],
  [MATERIAL.Fire]: [230, 82, 42, 255],
  [MATERIAL.Plant]: [79, 164, 91, 255],
};

export function materialColor(material: MaterialId): [number, number, number, number] {
  return MATERIAL_PALETTE[material];
}
