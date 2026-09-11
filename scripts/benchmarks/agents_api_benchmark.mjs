/** Bounded, explicit-run benchmark. Credentials never enter Blender. No retries of mutations. */
import fs from "node:fs";
import {
  parseAPIResponse,
  conservativeTokenCost,
} from "./agents_benchmark_protocol.mjs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const model = "gpt-6-astra";
const runName = process.argv[3] || "pilot-1";
if (!/^[a-z0-9-]+$/.test(runName)) throw Error("Invalid run name");
const directory = path.join(root, ".agartha/agents-api-benchmark", runName);
const arm = process.argv[2];
if (!["agents", "responses"].includes(arm))
  throw Error(
    "Usage: node scripts/benchmarks/agents_api_benchmark.mjs agents|responses [run-name]",
  );
fs.mkdirSync(directory, { recursive: true });
const out = path.join(directory, arm);
fs.mkdirSync(out, { recursive: true });
const stateFile = path.join(out, "run.json");
if (fs.existsSync(stateFile))
  throw Error(
    "Run already exists. Inspect it instead of creating a duplicate.",
  );
const env = process.env.OPENAI_API_KEY
  ? ""
  : fs.readFileSync(path.join(root, ".env.local"), "utf8");
const key =
  process.env.OPENAI_API_KEY ||
  env.match(/^OPENAI_API_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1];
if (!key) throw Error("OPENAI_API_KEY missing");
const state = {
  arm,
  model,
  startedAt: new Date().toISOString(),
  status: "starting",
  calls: [],
  usage: [],
  imageId: "im-qbL9GUr6H0d10SGP85tWNB",
};
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
save();
const deadline = Date.now() + 480000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(route, body, method = body ? "POST" : "GET") {
  const response = await fetch("https://api.openai.com/v1" + route, {
    method,
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      "OpenAI-Beta": "agents=v1",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(120000),
  });
  return parseAPIResponse(response);
}
async function worker(action, extra = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(
      "/private/tmp/agartha-managed-venv/bin/python",
      [path.join(root, "scripts/benchmarks/agents_blender_worker.py")],
      { cwd: root, stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "",
      stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(
        Error(
          "Worker command timed out; inspect durable worker.json before retrying.",
        ),
      );
    }, 100000);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0)
        return reject(Error(stderr.slice(-3000) || stdout.slice(-3000)));
      try {
        resolve(JSON.parse(stdout.trim().split("\n").at(-1)));
      } catch {
        reject(Error("Invalid worker output: " + stdout.slice(-1000)));
      }
    });
    child.stdin.end(JSON.stringify({ action, directory: out, ...extra }));
  });
}
const instructions = `You are a Blender 5.2 product modeler. Build the requested object using bpy through execute_blender_code. Code runs only in a persistent isolated Blender worker. Create all deliverable geometry as MESH objects in collection AGARTHA_MODEL. Camera, ground and lights must be outside that collection. Create a hero camera and soft studio lighting. Use principled materials. Do not download files or access network, subprocesses, credentials or unrelated filesystem paths. Tool-owned rendering and export are provided. Do not call render or export yourself. Inspect a preview, correct visible defects, then export_model. You have at most 8 tool calls, including retries. Aim to finish in 4-6 calls. One execute call will deliberately return a transient failure BEFORE executing any code, to test recovery. Retry it. Do not claim success without successful export. Be concise.`;
const brief = `Create an original sculptural lounge chair for a calm modern living room. Two continuous curved walnut side frames support a thick sage-green upholstered seat and a visibly reclined upholstered backrest. The seat should sit around 0.4m high; overall width around 0.8m. Show convincing structural connections, rounded cushion edges, a coherent comfortable silhouette and subtle material contrast. Front is negative Y, Z is up. No text or logos. This text-only pilot tests interpretation rather than fidelity to a reference. Deliver a GLB and editable Blender scene.`;
const schema = (name, description, properties) => ({
  type: "function",
  name,
  description,
  parameters: {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  },
});
const toolDefs = [
  schema(
    "execute_blender_code",
    "Run Python bpy code in the persistent Blender scene.",
    { code: { type: "string" } },
  ),
  schema("render_preview", "Inspect a model image.", {
    view: { type: "string", enum: ["hero", "front", "right"] },
  }),
  schema("export_model", "Export the completed model and editable scene.", {}),
];
state.instructions = instructions;
state.brief = brief;
state.tools = toolDefs;
save();
function usage(u) {
  if (!u) throw Error("Usage unavailable: stopping before further paid work.");
  state.usage.push(u);
  save();
}
function estimate() {
  return state.usage.reduce((n, u) => n + conservativeTokenCost(u), 0);
}
function guard() {
  if (Date.now() > deadline) throw Error("Run deadline reached");
  if (state.calls.length >= 8) throw Error("Tool-call limit reached");
  if (estimate() > 3)
    throw Error("Per-arm conservative token cost guard reached");
}
async function handle(call) {
  guard();
  if (state.calls.some((c) => c.id === call.call_id))
    throw Error("Repeated call: stopped to avoid duplicate execution");
  const record = {
    id: call.call_id,
    name: call.name,
    arguments: call.arguments,
    startedAt: new Date().toISOString(),
    status: "started",
  };
  state.calls.push(record);
  save();
  let result;
  if (call.name === "execute_blender_code" && !state.injectedFailure) {
    state.injectedFailure = true;
    result = {
      isError: true,
      content: [
        {
          type: "text",
          text: "Injected transient worker error. No code executed. Retry this call.",
        },
      ],
    };
  } else if (call.name === "execute_blender_code")
    result = await worker("execute", { code: call.arguments.code });
  else if (call.name === "render_preview")
    result = await worker("render", { view: call.arguments.view });
  else if (call.name === "export_model") {
    result = await worker("export");
    if (!result.isError) state.exported = true;
  } else throw Error("Unknown function");
  record.status = result.isError ? "error" : "completed";
  record.finishedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(out, "tool-" + state.calls.length + ".json"),
    JSON.stringify(result),
  );
  save();
  console.log(
    JSON.stringify({
      arm,
      tool: record.name,
      status: record.status,
      step: state.calls.length,
    }),
  );
  return (
    result.content?.map((c) =>
      c.type === "image"
        ? {
            type: "input_image",
            image_url: "data:" + c.mimeType + ";base64," + c.data,
          }
        : { type: "input_text", text: c.text || JSON.stringify(c) },
    ) || [{ type: "input_text", text: JSON.stringify(result) }]
  );
}
try {
  if (arm === "agents") {
    const session = await api("/agents/sessions", {
      environment: { type: "none" },
      agent: {
        model,
        instructions,
        reasoning: { effort: "low" },
        multi_agent: { enabled: false },
        service_tier: "default",
        tools: toolDefs,
      },
      input: brief,
      metadata: { benchmark: "agartha-pilot", run: path.basename(directory) },
      stream: false,
    });
    state.sessionId = session.id;
    save();
    console.log(JSON.stringify({ arm, sessionId: session.id }));
  }
  const start = await worker("start", { imageId: state.imageId });
  state.workerId = start.workerId;
  save();
  while (!(await worker("ready")).ready) {
    if (Date.now() > deadline) throw Error("Worker readiness deadline");
    await sleep(2000);
  }
  if (arm === "agents") {
    while (true) {
      if (Date.now() > deadline) throw Error("Session deadline");
      const session = await api("/agents/sessions/" + state.sessionId);
      state.lastSession = session;
      save();
      if (session.usage) {
        state.usage = [session.usage];
        if (estimate() > 3) throw Error("Per-arm cost guard reached");
      }
      if (session.status === "failed")
        throw Error("Hosted session failed: " + JSON.stringify(session));
      if (session.required_actions?.length) {
        if (!session.usage) {
          const turns = await api(
            `/agents/sessions/${session.id}/turns?limit=100`,
          );
          const current = turns.data?.find(
            (turn) => turn.id === session.required_actions[0].turn_id,
          );
          if (!current?.usage)
            throw Error("Turn usage unavailable at tool boundary");
          state.usage = [current.usage];
          save();
        }
        // Recover via a fresh GET at the first pending tool boundary, without replaying execution.
        if (!state.reconnected) {
          const recovered = await api("/agents/sessions/" + state.sessionId);
          state.reconnected = {
            sameSession: recovered.id === session.id,
            sameCalls:
              JSON.stringify(recovered.required_actions) ===
              JSON.stringify(session.required_actions),
          };
          save();
        }
        for (const call of session.required_actions) {
          const content = await handle(call);
          await api("/agents/sessions/" + session.id + "/events", {
            events: [
              {
                type: "agent.session.input.tool_result",
                turn_id: call.turn_id,
                call_id: call.call_id,
                success: true,
                output: content,
              },
            ],
          });
        }
      } else if (session.status === "idle") {
        const turns = await api(
          "/agents/sessions/" + session.id + "/turns?order=asc&limit=100",
        );
        state.turns = turns;
        save();
        if (turns.data?.some((t) => t.status === "completed")) break;
        if (turns.data?.some((t) => ["failed", "cancelled"].includes(t.status)))
          throw Error("Turn failed or cancelled");
      }
      await sleep(1500);
    }
  } else {
    let input = [{ role: "user", content: brief }];
    while (true) {
      guard();
      const response = await api("/responses", {
        model,
        instructions,
        reasoning: { effort: "low" },
        service_tier: "default",
        tools: toolDefs,
        input,
        max_output_tokens: 6000,
        store: false,
      });
      state.responseIds ??= [];
      state.responseIds.push(response.id);
      usage(response.usage);
      fs.writeFileSync(
        path.join(out, "response-" + state.responseIds.length + ".json"),
        JSON.stringify(response),
      );
      if (response.status !== "completed")
        throw Error("Response did not complete: " + response.status);
      input.push(...response.output);
      const calls = response.output.filter((i) => i.type === "function_call");
      if (!calls.length) break;
      for (const call of calls) {
        const content = await handle({
          ...call,
          arguments: JSON.parse(call.arguments),
        });
        input.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: content,
        });
      }
    }
  }
  if (!state.exported) throw Error("Model finished without exporting");
  state.modelFinishedAt = new Date().toISOString();
  for (const view of ["hero", "right"]) {
    const result = await worker("review_export", { view });
    if (result.isError) throw Error("Export review failed");
    fs.renameSync(
      path.join(out, "review_" + view + ".png"),
      path.join(out, "export_" + view + ".png"),
    );
  }
  state.status = "completed";
} catch (error) {
  state.status = "failed";
  state.error = String(error);
  console.error(state.error);
} finally {
  if (state.sessionId) {
    try {
      if (state.status !== "completed")
        await api("/agents/sessions/" + state.sessionId + "/events", {
          events: [{ type: "agent.session.input.cancel" }],
        });
      const session = await api("/agents/sessions/" + state.sessionId);
      state.lastSession = session;
      if (session.usage) state.usage = [session.usage];
      else {
        const turns = await api(
          `/agents/sessions/${session.id}/turns?limit=100`,
        );
        state.turns = turns;
        if (turns.data?.length && turns.data.every((turn) => turn.usage)) {
          state.usage = turns.data.map((turn) => turn.usage);
        } else state.usageUnavailable = true;
      }
      let items = [],
        after = "";
      for (let i = 0; i < 10; i++) {
        const page = await api(
          "/agents/sessions/" +
            state.sessionId +
            "/items?limit=100&order=asc" +
            after,
        );
        items.push(...page.data);
        if (!page.has_more) break;
        after = "&after=" + encodeURIComponent(page.last_id);
      }
      fs.writeFileSync(
        path.join(out, "session-items.json"),
        JSON.stringify(items),
      );
    } catch (e) {
      state.sessionCleanupError = String(e);
    }
  }
  try {
    if (fs.existsSync(path.join(out, "worker.json"))) {
      state.workerStop = await worker("stop");
      for (let i = 0; i < 5 && state.workerStop.exitCode == null; i++) {
        await sleep(1000);
        state.workerStop = await worker("ready");
      }
    }
  } catch (e) {
    state.workerCleanupError = String(e);
  }
  state.finishedAt = new Date().toISOString();
  state.conservativeTokenEstimateUSD = estimate();
  save();
  console.log(
    JSON.stringify({
      arm,
      status: state.status,
      error: state.error,
      seconds:
        (Date.parse(state.finishedAt) - Date.parse(state.startedAt)) / 1000,
      tokenEstimateUSD: estimate(),
      workerStop: state.workerStop,
    }),
  );
}
