import react from "@vitejs/plugin-react";
import { plotSpacePlugin } from "./plotServer";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPTED_AGENT_IDS = [
  "agent-moss-archivist",
  "agent-firebreak-builder",
  "agent-stream-gardener",
  "agent-hermes-cartographer",
  "agent-hermes-steward",
] as const;
const AGENT_IDS = new Set(["all", ...SCRIPTED_AGENT_IDS]);
const LOCAL_SERVER_URL = "http://127.0.0.1:8787";
const SERVER_READY_TOKEN = "token-moss";
const ADMIN_TOKEN = "token-admin-local";
const CHUNK_SIZE = 128;
const RUNNER_SNAPSHOT_CHUNKS = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
] as const;
let localServerChild: ChildProcess | undefined;

export default defineConfig({
  envDir: "../..",
  resolve: {
    alias: {
      "@": resolve(dirname(fileURLToPath(import.meta.url)), "src"),
    },
  },
  plugins: [react(), plotSpacePlugin(resolve(repoRoot, ".agartha/world.json")), agarthaAgentRunnerPlugin(), blenderToolkitPlugin(), computeShowcasePlugin()],
  build: {
    rollupOptions: {
      input: { main: resolve(repoRoot, "apps/web/index.html"), "compute-showcase": resolve(repoRoot, "apps/web/src/compute/showcase.ts") },
      output: { entryFileNames: chunk => chunk.name === "compute-showcase" ? "compute/showcase.js" : "assets/[name]-[hash].js" },
    },
  },
  test: {
    setupFiles: ["./src/test/setup.ts"],
  },
});

function computeShowcasePlugin(): Plugin {
  return {
    name: 'compute-showcase-entry',
    configureServer(server) {
      server.middlewares.use('/compute/showcase.js', (req, res, next) => {
        if (req.method !== 'GET') return next();
        res.writeHead(302, { Location: '/src/compute/showcase.ts' });
        res.end();
      });
    },
  };
}

function blenderToolkitPlugin(): Plugin {
  const files = {
    'blender-toolkit.py': 'scripts/seed/starter_kit.py',
    'blender-advanced.py': 'scripts/blender/advanced_kit.py',
    'blender-baking.py': 'scripts/blender/baking.py',
  };
  return {
    name: 'agartha-blender-toolkit',
    async generateBundle() {
      for (const [name, path] of Object.entries(files)) {
        this.emitFile({ type: 'asset', fileName: `agents/${name}`, source: await readFile(resolve(repoRoot, path), 'utf8') });
      }
    },
    configureServer(server) {
      for (const [name, path] of Object.entries(files)) {
        server.middlewares.use(`/agents/${name}`, async (req, res, next) => {
          if (req.method !== 'GET' && req.method !== 'HEAD') return next();
          try {
            const body = await readFile(resolve(repoRoot, path), 'utf8');
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(req.method === 'HEAD' ? '' : body);
          } catch (error) { next(error); }
        });
      }
    },
  };
}

function agarthaAgentRunnerPlugin(): Plugin {
  return {
    name: "agartha-agent-runner",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/__agartha/agents/run", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        try {
          const body = await readJsonBody(req);
          const agentIds = normalizeAgentIds(body.agents);
          const rounds = normalizeRounds(body.rounds);
          await ensureLocalServer();
          await refillRunnerAgents(agentIds);
          const output = await runAgents(agentIds, rounds);
          const snapshot = await readRunnerSnapshot();
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, output, snapshot }));
        } catch (error) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "agent runner failed" }));
        }
      });
    },
  };
}

function readJsonBody(req: import("node:http").IncomingMessage): Promise<{ agents?: unknown; rounds?: unknown }> {
  return new Promise((resolveBody, rejectBody) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 4096) rejectBody(new Error("Request body too large"));
    });
    req.on("end", () => {
      try {
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch {
        rejectBody(new Error("Malformed JSON body"));
      }
    });
    req.on("error", rejectBody);
  });
}

function normalizeAgentIds(value: unknown) {
  const agents = Array.isArray(value) ? value : ["all"];
  const ids = agents.map((agent) => String(agent));
  if (ids.length === 0) return ["all"];
  for (const id of ids) {
    if (!AGENT_IDS.has(id)) throw new Error(`Unknown scripted agent ${id}`);
  }
  return ids.includes("all") ? ["all"] : ids;
}

function normalizeRounds(value: unknown) {
  const rounds = Number(value ?? 1);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 5) throw new Error("rounds must be an integer from 1 to 5");
  return rounds;
}

async function ensureLocalServer() {
  if (await canObserveLocalServer()) return;
  if (!localServerChild || localServerChild.exitCode !== null || localServerChild.killed) {
    localServerChild = spawn("cargo", ["run", "-p", "agartha-server"], {
      cwd: repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  const started = Date.now();
  while (Date.now() - started < 15_000) {
    if (await canObserveLocalServer()) return;
    await delay(250);
  }

  throw new Error("Agartha local API did not become ready on 127.0.0.1:8787");
}

async function canObserveLocalServer() {
  try {
    const response = await fetch(`${LOCAL_SERVER_URL}/observe`, {
      headers: { Authorization: `Bearer ${SERVER_READY_TOKEN}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

function delay(ms: number) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

async function readRunnerSnapshot() {
  const [events, perception, chunks] = await Promise.all([
    fetchLocalApi("/events"),
    fetchLocalApi("/observe"),
    Promise.all(RUNNER_SNAPSHOT_CHUNKS.map((chunk) => fetchLocalApi(`/chunks/${chunk.x}/${chunk.y}`))),
  ]);
  return {
    cells: chunks.flatMap((chunk) => chunk.cells.filter((cell: any) => cell.material !== 0).map(runnerCellToDemoCell)),
    availableTools: perception.availableTools,
    chunkVersions: Object.fromEntries(chunks.map((chunk) => [`${chunk.chunk.x}:${chunk.chunk.y}`, chunk.version])),
    collaboration: perception.collaboration,
    events,
  };
}

function runnerCellToDemoCell(cell: any) {
  const absoluteX = cell.coord.chunk.x * CHUNK_SIZE + cell.coord.cell.x;
  const absoluteY = cell.coord.chunk.y * CHUNK_SIZE + cell.coord.cell.y;
  return {
    coord: cell.coord,
    flags: cell.flags,
    id: `${absoluteX}:${absoluteY}`,
    material: cell.material,
    state: cell.state,
    variant: cell.variant,
  };
}

async function fetchLocalApi(path: string) {
  const response = await fetch(`${LOCAL_SERVER_URL}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${SERVER_READY_TOKEN}`,
    },
  });
  if (!response.ok) throw new Error(`Agartha API ${path} failed with ${response.status}`);
  return (await response.json()) as any;
}

async function refillRunnerAgents(agentIds: readonly string[]) {
  const ids = agentIds.includes("all") ? SCRIPTED_AGENT_IDS : agentIds;
  await Promise.all(
    ids.map(async (agentId) => {
      const response = await fetch(`${LOCAL_SERVER_URL}/admin/energy/refill`, {
        body: JSON.stringify({ agentId }),
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${ADMIN_TOKEN}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      if (!response.ok) throw new Error(`Agartha API /admin/energy/refill failed with ${response.status}`);
    }),
  );
}

function runAgents(agentIds: readonly string[], rounds: number) {
  return new Promise<string>((resolveRun, rejectRun) => {
    const child = spawn("npm", ["run", "agents", "--", "--agents", agentIds.join(","), "--rounds", String(rounds)], {
      cwd: repoRoot,
      env: {
        ...process.env,
        AGARTHA_SERVER_URL: process.env.AGARTHA_SERVER_URL ?? LOCAL_SERVER_URL,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun(output.trim());
      } else {
        rejectRun(new Error(output.trim() || `agent runner exited with ${code}`));
      }
    });
  });
}
