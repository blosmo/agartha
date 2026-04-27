import type { AgentPerception } from "@agartha/protocol/actions";
import { MATERIAL } from "@agartha/protocol/world";

import type { AgentClient, AgentTurnRecord } from "../agentClient";
import { recordTurn } from "../agentClient";

export async function runFirebreakBuilderTurn(
  client: AgentClient,
  perception: AgentPerception,
): Promise<AgentTurnRecord[]> {
  const fire = perception.visibleCells.find((cell) => cell.material === MATERIAL.Fire);
  const plant = perception.visibleCells.find((cell) => cell.material === MATERIAL.Plant);

  if (!fire || !plant || perception.worldEnergy.current < 6) {
    const result = await client.submitNote("No viable firebreak placement this turn.", perception.position);
    return [recordTurn("submit_note", result)];
  }

  const action = {
    actionType: "place_material" as const,
    payload: { target: plant.coord, material: MATERIAL.Stone },
  };

  await client.quote(action);
  return [recordTurn("place_material", await client.act(action))];
}
