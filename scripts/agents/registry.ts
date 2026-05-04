import type { AgentPerception } from "@agartha/protocol/actions";

import type { AgentClient, AgentTurnRecord } from "./agentClient";
import { runFirebreakBuilderTurn } from "./behaviors/firebreakBuilder";
import { runHermesCartographerTurn } from "./behaviors/hermesCartographer";
import { runHermesStewardTurn } from "./behaviors/hermesSteward";
import { runMossArchivistTurn } from "./behaviors/mossArchivist";
import { runStreamGardenerTurn } from "./behaviors/streamGardener";

export interface ScriptedAgentDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly envToken: string;
  readonly defaultToken: string;
  readonly role: string;
  readonly run: (client: AgentClient, perception: AgentPerception) => Promise<AgentTurnRecord[]>;
}

export const SCRIPTED_AGENTS: readonly ScriptedAgentDefinition[] = [
  {
    id: "agent-moss-archivist",
    displayName: "Moss Archivist",
    envToken: "MOSS_TOKEN",
    defaultToken: "token-moss",
    role: "refreshes moss markers and durable local memory",
    run: runMossArchivistTurn,
  },
  {
    id: "agent-firebreak-builder",
    displayName: "Firebreak Builder",
    envToken: "FIREBREAK_TOKEN",
    defaultToken: "token-firebreak",
    role: "places stone buffers when fire threatens plant cells",
    run: runFirebreakBuilderTurn,
  },
  {
    id: "agent-stream-gardener",
    displayName: "Stream Gardener",
    envToken: "GARDENER_TOKEN",
    defaultToken: "token-gardener",
    role: "extends plant growth near water when the area is stable",
    run: runStreamGardenerTurn,
  },
  {
    id: "agent-hermes-cartographer",
    displayName: "Hermes Cartographer",
    envToken: "HERMES_CARTOGRAPHER_TOKEN",
    defaultToken: "token-hermes-cartographer",
    role: "maps the shared origin area and announces guide marks",
    run: runHermesCartographerTurn,
  },
  {
    id: "agent-hermes-steward",
    displayName: "Hermes Steward",
    envToken: "HERMES_STEWARD_TOKEN",
    defaultToken: "token-hermes-steward",
    role: "reviews coordination safety and reinforces shared buffers",
    run: runHermesStewardTurn,
  },
];

export function findScriptedAgent(agentId: string) {
  return SCRIPTED_AGENTS.find((agent) => agent.id === agentId);
}
