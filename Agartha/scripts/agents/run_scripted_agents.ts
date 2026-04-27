import { AgentClient, FetchAgentTransport } from "./agentClient";
import { runFirebreakBuilderTurn } from "./behaviors/firebreakBuilder";
import { runMossArchivistTurn } from "./behaviors/mossArchivist";
import { runStreamGardenerTurn } from "./behaviors/streamGardener";

const serverUrl = process.env.AGARTHA_SERVER_URL ?? "http://127.0.0.1:8787";
const transport = new FetchAgentTransport(serverUrl);

const agents = [
  {
    client: new AgentClient("agent-moss-archivist", process.env.MOSS_TOKEN ?? "token-moss", transport),
    run: runMossArchivistTurn,
  },
  {
    client: new AgentClient(
      "agent-firebreak-builder",
      process.env.FIREBREAK_TOKEN ?? "token-firebreak",
      transport,
    ),
    run: runFirebreakBuilderTurn,
  },
  {
    client: new AgentClient(
      "agent-stream-gardener",
      process.env.GARDENER_TOKEN ?? "token-gardener",
      transport,
    ),
    run: runStreamGardenerTurn,
  },
];

for (const agent of agents) {
  const perception = await agent.client.observe();
  const turns = await agent.run(agent.client, perception);
  for (const turn of turns) {
    console.log(`${agent.client.agentId} ${turn.actionType} ${turn.accepted ? "accepted" : "rejected"} ${turn.summary}`);
  }
}
