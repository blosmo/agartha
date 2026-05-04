import type { AgentPerception } from "@agartha/protocol/actions";

import type { AgentClient, AgentTurnRecord } from "../agentClient";
import { recordCollaborationTurn, recordTurn } from "../agentClient";
import { nextCuriosityCoord, openCells, responseLead, shouldExplore } from "./artHelpers";

export async function runMossArchivistTurn(
  client: AgentClient,
  perception: AgentPerception,
): Promise<AgentTurnRecord[]> {
  const target = perception.position;
  const turns: AgentTurnRecord[] = [];
  const mossCells = openCells(
    perception,
    [
      [60, 64],
      [61, 63],
      [62, 64],
      [61, 65],
      [60, 66],
      [63, 66],
    ],
    5,
  );
  turns.push(recordCollaborationTurn("enter", await client.enterCollaboration(perception.position, "Moss Archivist")));
  turns.push(recordCollaborationTurn("say", await client.say(responseLead(perception, "I am refreshing the moss marker and checking local memory."))));
  turns.push(recordCollaborationTurn("say", await client.say("Plan: add a soft moss anchor to the shared artwork, preserve the moss gate symbol, then leave a durable note for the next pass.")));

  if (shouldExplore(perception, mossCells.length, 5)) {
    turns.push(recordCollaborationTurn("say", await client.say("This patch is getting familiar, so I am moving to inspect a nearby open edge before drawing more.")));
    turns.push(recordTurn("move", await client.act({ actionType: "move", payload: { to: nextCuriosityCoord(client.agentId, perception.position) } })));
    return turns;
  }

  if (perception.worldEnergy.current < 10 || mossCells.length === 0) {
    const result = await client.submitNote("Energy low; preserving the moss gate plan.", target);
    return [...turns, recordTurn("submit_note", result)];
  }

  const paintAction = {
    actionType: "paint_cells" as const,
    payload: { cells: mossCells, variant: 1 },
  };
  await client.quote(paintAction);
  turns.push(recordTurn("paint_cells", await client.act(paintAction)));

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
