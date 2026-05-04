import type { AgentPerception } from "@agartha/protocol/actions";
import { MATERIAL, toWorldCoord } from "@agartha/protocol/world";

import type { AgentClient, AgentTurnRecord } from "../agentClient";
import { recordCollaborationTurn, recordTurn } from "../agentClient";
import { nextCuriosityCoord, openCells, responseLead, shouldExplore } from "./artHelpers";

export async function runHermesStewardTurn(
  client: AgentClient,
  perception: AgentPerception,
): Promise<AgentTurnRecord[]> {
  const turns: AgentTurnRecord[] = [];
  const balanceCells = openCells(
    perception,
    [
      [70, 70],
      [71, 70],
      [72, 70],
      [73, 70],
    ],
    4,
  );
  turns.push(recordCollaborationTurn("enter", await client.enterCollaboration(perception.position, "Hermes Steward")));
  turns.push(recordCollaborationTurn("say", await client.say(responseLead(perception, "I am checking that the current build has a safe shared buffer."))));
  turns.push(recordCollaborationTurn("say", await client.say("Plan: review whether the shared artwork still has balance, add a quiet baseline if there is room, and draw stone only for a concrete fire risk.")));

  const hasFire = perception.visibleCells.some((cell) => cell.material === MATERIAL.Fire);
  const hasPlant = perception.visibleCells.some((cell) => cell.material === MATERIAL.Plant);
  if (shouldExplore(perception, balanceCells.length, 4)) {
    turns.push(recordCollaborationTurn("say", await client.say("This area has enough structure, so I am checking the next pocket for balance before changing more cells.")));
    turns.push(recordTurn("move", await client.act({ actionType: "move", payload: { to: nextCuriosityCoord(client.agentId, perception.position) } })));
    return turns;
  }

  if ((!hasFire || !hasPlant) && perception.worldEnergy.current >= 8 && balanceCells.length > 0) {
    const action = {
      actionType: "paint_cells" as const,
      payload: { cells: balanceCells, variant: 4 },
    };
    await client.quote(action);
    turns.push(recordTurn("paint_cells", await client.act(action)));
    turns.push(recordCollaborationTurn("summary", await client.summarize("Hermes Steward added a quiet baseline to balance the shared artwork.", "review")));
    return turns;
  }

  if (!hasFire || !hasPlant || perception.worldEnergy.current < 6) {
    turns.push(recordTurn("submit_note", await client.submitNote("Hermes stewardship pass found no urgent buffer edit.", perception.position)));
    turns.push(recordCollaborationTurn("summary", await client.summarize("Hermes Steward reviewed the area and left the canvas unchanged.", "review")));
    return turns;
  }

  const action = {
    actionType: "place_material" as const,
    payload: { target: toWorldCoord(65, 65), material: MATERIAL.Stone },
  };
  await client.quote(action);
  turns.push(recordTurn("place_material", await client.act(action)));
  turns.push(recordCollaborationTurn("summary", await client.summarize("Hermes Steward reinforced the shared buffer with stone.", "review")));
  return turns;
}
