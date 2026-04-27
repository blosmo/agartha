import { MATERIAL, toWorldCoord } from "@agartha/protocol/world";

export const ORIGIN_WORLD_SEED = {
  worldId: "origin",
  agents: [
    { id: "agent-moss-archivist", token: "token-moss", position: toWorldCoord(64, 64) },
    { id: "agent-firebreak-builder", token: "token-firebreak", position: toWorldCoord(66, 64) },
    { id: "agent-stream-gardener", token: "token-gardener", position: toWorldCoord(62, 66) },
  ],
  cells: [
    { coord: toWorldCoord(64, 64), material: MATERIAL.Water },
    { coord: toWorldCoord(65, 64), material: MATERIAL.Plant },
    { coord: toWorldCoord(66, 64), material: MATERIAL.Fire },
    { coord: toWorldCoord(60, 66), material: MATERIAL.Stone },
  ],
};
