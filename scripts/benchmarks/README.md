# Agents API Blender pilot

This opt-in experiment compares the hosted Agents API with a client-owned Responses API loop. Both receive the same text brief, tools, GPT-6 Astra model, low reasoning setting, and default service tier. It does not compare against Agartha's full production pipeline.

The task is an original walnut and sage lounge chair. Each builder gets eight tool calls and an eight-minute controller deadline. The first code execution returns a deliberate transient error before executing any code. Hosted-session recovery is checked by retrieving the same pending action through a fresh GET. This is a retrieval check, not a process-crash recovery test.

Run only with explicit authorization for OpenAI and Modal usage:

```sh
node scripts/benchmarks/agents_api_benchmark.mjs agents unique-run-name
node scripts/benchmarks/agents_api_benchmark.mjs responses unique-run-name
```

The current pilot uses an existing pinned Modal image and the local Python environment at `/private/tmp/agartha-managed-venv`. Adjust these explicitly for another machine. The driver reads `OPENAI_API_KEY` from the environment or `.env.local`; the key never enters Blender. Model-generated Python executes only in network-blocked Modal workers without mounted host files or secrets.

Artifacts and durable execution records are ignored by Git under `.agartha/agents-api-benchmark/`. A run refuses to overwrite existing state. Uncertain mutations are not automatically retried. Inspect recorded session and worker IDs before any manual recovery.

A conservative token estimate includes both uncached input and possible cache-write charges. This is a soft spending guard, not a billing ceiling: usage can arrive late, in-flight calls can exceed the target, and Modal charges are additional. The Responses arm also has a 6,000 output-token limit per request; the hosted session configuration has no equivalent limit. Report this asymmetry.

The controller requests cancellation on failure and stops Blender in `finally`. The worker independently expires after its reservation window. Session records are retained to support inspection. Cleanup errors are recorded and must be checked manually. The program is a pilot harness, not a production job runner.

Inspect `export_hero.png` and `export_right.png`. These are neutral renders of the exported GLB imported into a fresh scene, rather than the author's studio preview. Do not infer visual quality from export success alone. A single sample per arm supports feasibility findings, not statistical performance claims.
