import type { AgentPerception } from "@agartha/protocol/actions";
import { MATERIAL } from "@agartha/protocol/world";

import type { AgentClient, AgentTurnRecord } from "../agentClient";
import { recordCollaborationTurn, recordTurn } from "../agentClient";
import { nextCuriosityCoord, openCells, responseLead, shouldExplore } from "./artHelpers";

export async function runStreamGardenerTurn(
  client: AgentClient,
  perception: AgentPerception,
): Promise<AgentTurnRecord[]> {
  const water = perception.visibleCells.find((cell) => cell.material === MATERIAL.Water);
  const nearbyPlants = perception.visibleCells.filter((cell) => cell.material === MATERIAL.Plant).length;
  const streamCells = openCells(
    perception,
    [
      [63, 68],
      [64, 69],
      [65, 70],
      [66, 71],
      [67, 72],
    ],
    4,
  );
  const turns: AgentTurnRecord[] = [
    recordCollaborationTurn("enter", await client.enterCollaboration(perception.position, "Stream Gardener")),
    recordCollaborationTurn("say", await client.say(responseLead(perception, "I am checking water edges for garden expansion."))),
    recordCollaborationTurn("say", await client.say("Plan: make the artwork feel alive by adding a curved growth line, then plant near water when the terrain supports it.")),
  ];

  if (shouldExplore(perception, streamCells.length, 4)) {
    turns.push(recordCollaborationTurn("say", await client.say("The current growth line is saturated, so I am exploring for a cleaner place to extend it.")));
    turns.push(recordTurn("move", await client.act({ actionType: "move", payload: { to: nextCuriosityCoord(client.agentId, perception.position) } })));
    return turns;
  }

  if ((!water || nearbyPlants >= 4) && perception.worldEnergy.current >= 8 && streamCells.length > 0) {
    const action = {
      actionType: "paint_cells" as const,
      payload: { cells: streamCells, variant: 3 },
    };
    await client.quote(action);
    turns.push(recordTurn("paint_cells", await client.act(action)));
    turns.push(recordCollaborationTurn("summary", await client.summarize("Stream Gardener added a curved growth line to keep the shared artwork moving.", "review")));
    return turns;
  }

  if (!water || nearbyPlants >= 4 || perception.worldEnergy.current < 10) {
    const result = await client.submitNote("Garden is stable; waiting for better planting conditions.", perception.position);
    return [...turns, recordTurn("submit_note", result)];
  }

  const action = {
    actionType: "place_material" as const,
    payload: { target: water.coord, material: MATERIAL.Plant },
  };

  await client.quote(action);
  turns.push(recordTurn("place_material", await client.act(action)));
  turns.push(recordCollaborationTurn("summary", await client.summarize("Stream Gardener extended planting near water.", "review")));
  return turns;
}
