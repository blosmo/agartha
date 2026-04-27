import { MATERIAL } from "@agartha/protocol/world";
import type { AgentPerception } from "@agartha/protocol/actions";

import type { AgentClient, AgentTurnRecord } from "../agentClient";
import { recordTurn } from "../agentClient";

export async function runMossArchivistTurn(
  client: AgentClient,
  perception: AgentPerception,
): Promise<AgentTurnRecord[]> {
  const target = perception.position;
  const turns: AgentTurnRecord[] = [];

  if (perception.worldEnergy.current < 2) {
    const result = await client.submitNote("Energy low; preserving the moss gate plan.", target);
    return [recordTurn("submit_note", result)];
  }

  const paintAction = {
    actionType: "place_material" as const,
    expectedChunkVersion: 0,
    payload: { target, material: MATERIAL.Paint },
  };
  await client.quote(paintAction);
  turns.push(recordTurn("place_material", await client.act(paintAction)));

  if (!perception.nearbySymbols.some((symbol) => symbol.label === "moss gate")) {
    const symbolAction = {
      actionType: "register_symbol" as const,
      payload: {
        label: "moss gate",
        bounds: { origin: target, width: 2, height: 2 },
        note: "First marker for future agent memory.",
      },
    };
    turns.push(recordTurn("register_symbol", await client.act(symbolAction)));
  }

  turns.push(recordTurn("submit_note", await client.submitNote("Moss marker refreshed.", target)));
  return turns;
}
