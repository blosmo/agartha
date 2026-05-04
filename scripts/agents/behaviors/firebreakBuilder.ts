import type { AgentPerception } from "@agartha/protocol/actions";
import { MATERIAL } from "@agartha/protocol/world";

import type { AgentClient, AgentTurnRecord } from "../agentClient";
import { recordCollaborationTurn, recordTurn } from "../agentClient";
import { nextCuriosityCoord, openCells, responseLead, shouldExplore } from "./artHelpers";

export async function runFirebreakBuilderTurn(
  client: AgentClient,
  perception: AgentPerception,
): Promise<AgentTurnRecord[]> {
  const fire = perception.visibleCells.find((cell) => cell.material === MATERIAL.Fire);
  const plant = perception.visibleCells.find((cell) => cell.material === MATERIAL.Plant);
  const emberCells = openCells(
    perception,
    [
      [68, 63],
      [69, 64],
      [70, 65],
      [71, 66],
      [72, 67],
    ],
    4,
  );
  const turns: AgentTurnRecord[] = [
    recordCollaborationTurn("enter", await client.enterCollaboration(perception.position, "Firebreak Builder")),
    recordCollaborationTurn("say", await client.say(responseLead(perception, "I am checking whether fire threatens nearby plant cells."))),
    recordCollaborationTurn("say", await client.say("Plan: protect the shared artwork's composition, add a warm diagonal counterline, and place stone only when fire touches plant growth.")),
  ];

  if (shouldExplore(perception, emberCells.length, 4)) {
    turns.push(recordCollaborationTurn("say", await client.say("I do not see enough fresh edge here, so I am scouting the next boundary before adding more contrast.")));
    turns.push(recordTurn("move", await client.act({ actionType: "move", payload: { to: nextCuriosityCoord(client.agentId, perception.position) } })));
    return turns;
  }

  if ((!fire || !plant) && perception.worldEnergy.current >= 8 && emberCells.length > 0) {
    const action = {
      actionType: "paint_cells" as const,
      payload: { cells: emberCells, variant: 2 },
    };
    await client.quote(action);
    turns.push(recordTurn("paint_cells", await client.act(action)));
    turns.push(recordCollaborationTurn("summary", await client.summarize("Firebreak Builder added a warm counterline so the shared artwork has visible contrast.", "review")));
    return turns;
  }

  if (!fire || !plant || perception.worldEnergy.current < 6) {
    const result = await client.submitNote("No viable firebreak placement this turn.", perception.position);
    return [...turns, recordTurn("submit_note", result)];
  }

  const action = {
    actionType: "place_material" as const,
    payload: { target: plant.coord, material: MATERIAL.Stone },
  };

  await client.quote(action);
  turns.push(recordTurn("place_material", await client.act(action)));
  turns.push(recordCollaborationTurn("summary", await client.summarize("Firebreak Builder reinforced a threatened plant edge.", "review")));
  return turns;
}
