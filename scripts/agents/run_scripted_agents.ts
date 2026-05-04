import { AgentClient, FetchAgentTransport } from "./agentClient";
import { findScriptedAgent, SCRIPTED_AGENTS, type ScriptedAgentDefinition } from "./registry";

interface RunnerOptions {
  readonly agentIds: readonly string[];
  readonly list: boolean;
  readonly rounds: number;
  readonly serverUrl: string;
}

const options = parseRunnerOptions(process.argv.slice(2), process.env);

if (options.list) {
  for (const agent of SCRIPTED_AGENTS) {
    console.log(`${agent.id}\t${agent.displayName}\t${agent.role}`);
  }
} else {
  const transport = new FetchAgentTransport(options.serverUrl);
  const selectedAgents = selectAgents(options.agentIds);

  for (let round = 1; round <= options.rounds; round += 1) {
    for (const agent of selectedAgents) {
      const lines = await runAgentRoundSafely(agent, transport, round);
      for (const line of lines) console.log(line);
    }
  }
}

async function runAgentRoundSafely(agent: ScriptedAgentDefinition, transport: FetchAgentTransport, round: number) {
  try {
    return await runAgentRound(agent, transport, round);
  } catch (error) {
    const message = error instanceof Error ? error.message : "agent round failed";
    return [`round=${round} agent=${agent.id} action=observe status=failed summary="${escapeSummary(message)}"`];
  }
}

async function runAgentRound(agent: ScriptedAgentDefinition, transport: FetchAgentTransport, round: number) {
  const token = process.env[agent.envToken] ?? agent.defaultToken;
  const client = new AgentClient(agent.id, token, transport);
  const perception = await client.observe();
  const turns = await agent.run(client, perception);
  return turns.map(
    (turn) =>
      `round=${round} agent=${client.agentId} action=${turn.actionType} status=${
        turn.accepted ? "accepted" : "rejected"
      } summary="${escapeSummary(turn.summary)}"`,
  );
}

function escapeSummary(summary: string) {
  return summary.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", " ");
}

function selectAgents(agentIds: readonly string[]) {
  if (agentIds.length === 0 || agentIds.includes("all")) return [...SCRIPTED_AGENTS];

  return agentIds.map((agentId) => {
    const agent = findScriptedAgent(agentId);
    if (!agent) throw new Error(`Unknown scripted agent ${agentId}. Run with --list to see available agents.`);
    return agent;
  });
}

function parseRunnerOptions(argv: readonly string[], env: Record<string, string | undefined>): RunnerOptions {
  let list = false;
  let rounds = Number(env.AGARTHA_AGENT_ROUNDS ?? 1);
  let serverUrl = env.AGARTHA_SERVER_URL ?? "http://127.0.0.1:8787";
  let agentIds: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--list") {
      list = true;
      continue;
    }
    if (arg === "--rounds") {
      rounds = Number(argv[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (arg === "--server-url") {
      serverUrl = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--agents") {
      agentIds = (argv[index + 1] ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }
    throw new Error(`Unknown runner option ${arg}`);
  }

  if (!Number.isInteger(rounds) || rounds < 1) throw new Error("--rounds must be a positive integer");
  if (!serverUrl) throw new Error("--server-url must not be empty");

  return { agentIds, list, rounds, serverUrl };
}
