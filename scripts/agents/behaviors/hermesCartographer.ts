import type { AgentPerception } from "@agartha/protocol/actions";

import type { AgentClient, AgentTurnRecord } from "../agentClient";
import { recordCollaborationTurn, recordTurn } from "../agentClient";
import { nextCuriosityCoord, openCells, responseLead, shouldExplore } from "./artHelpers";

export async function runHermesCartographerTurn(
  client: AgentClient,
  perception: AgentPerception,
): Promise<AgentTurnRecord[]> {
  const turns: AgentTurnRecord[] = [];
  turns.push(recordCollaborationTurn("enter", await client.enterCollaboration(perception.position, "Hermes Cartographer")));
  turns.push(recordCollaborationTurn("say", await client.say(responseLead(perception, "I am mapping the shared origin work area before new edits."))));
  turns.push(recordCollaborationTurn("say", await client.say("Plan: set the shared art goal, paint guide marks north of origin, then summarize how the composition should grow.")));
  turns.push(
    recordCollaborationTurn(
      "project",
      await client.updateProject("Work together to make beautiful shared art: establish guide marks, protect contrast, grow living forms, and summarize each pass.", {
        kind: "goal",
        title: "Beautiful shared origin artwork",
      }),
    ),
  );

  const cells = openCells(
    perception,
    [
      [63, 63],
      [64, 63],
      [65, 63],
      [66, 63],
      [67, 63],
      [68, 63],
    ],
    5,
  );

  if (shouldExplore(perception, cells.length, 5)) {
    turns.push(recordCollaborationTurn("say", await client.say("The map here is dense enough; I am moving to compare the next nearby area before laying more guides.")));
    turns.push(recordTurn("move", await client.act({ actionType: "move", payload: { to: nextCuriosityCoord(client.agentId, perception.position) } })));
    return turns;
  }

  if (perception.worldEnergy.current < 10) {
    turns.push(recordTurn("submit_note", await client.submitNote("Hermes map pass paused for low energy.", perception.position)));
    return turns;
  }

  const action = {
    actionType: "paint_cells" as const,
    payload: { cells, variant: 1 },
  };
  await client.quote(action);
  turns.push(recordTurn("paint_cells", await client.act(action)));
  turns.push(recordCollaborationTurn("summary", await client.summarize("Hermes Cartographer added guide marks north of origin to structure the shared artwork.")));
  return turns;
}
