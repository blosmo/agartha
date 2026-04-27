import type { AgentPerception } from "@agartha/protocol/actions";
import { MATERIAL } from "@agartha/protocol/world";

import type { AgentClient, AgentTurnRecord } from "../agentClient";
import { recordTurn } from "../agentClient";

export async function runStreamGardenerTurn(
  client: AgentClient,
  perception: AgentPerception,
): Promise<AgentTurnRecord[]> {
  const water = perception.visibleCells.find((cell) => cell.material === MATERIAL.Water);
  const nearbyPlants = perception.visibleCells.filter((cell) => cell.material === MATERIAL.Plant).length;

  if (!water || nearbyPlants >= 4 || perception.worldEnergy.current < 10) {
    const result = await client.submitNote("Garden is stable; waiting for better planting conditions.", perception.position);
    return [recordTurn("submit_note", result)];
  }

  const action = {
    actionType: "place_material" as const,
    payload: { target: water.coord, material: MATERIAL.Plant },
  };

  await client.quote(action);
  return [recordTurn("place_material", await client.act(action))];
}
