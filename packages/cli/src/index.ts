#!/usr/bin/env tsx
import { AgarthaClient } from "./client";
import { actionEnvelope, runObserve } from "./commands/observe";
import { runChunk, runEvents, watchRequest } from "./commands/read";
import { errorBody, exitCodeFor, printJson } from "./output";
import { optionalNumberOption, optionalOption, parseArgs, requiredOption, tokenForAgent } from "./parse";

export async function runCli(
  argv: readonly string[],
  env: Record<string, string | undefined> = process.env,
  io: {
    readonly stdout: Pick<typeof process.stdout, "write">;
    readonly stderr: Pick<typeof process.stderr, "write">;
  } = { stdout: process.stdout, stderr: process.stderr },
): Promise<number> {
  try {
    const command = parseArgs(argv);
    if (command.command === "help" || command.options.has("help")) {
      printJson(help(), io.stdout);
      return 0;
    }

    const backend = env.AGARTHA_BACKEND === "convex" || env.AGARTHA_CONVEX_HTTP_URL ? "convex" : "rust";
    const baseUrl =
      backend === "convex"
        ? env.AGARTHA_CONVEX_HTTP_URL ?? requiredEnv("AGARTHA_CONVEX_HTTP_URL", env)
        : env.AGARTHA_SERVER_URL ?? "http://127.0.0.1:8787";

    if (command.command === "admin") {
      const token = optionalOption(command, "admin-token") ?? env.AGARTHA_ADMIN_TOKEN ?? "token-admin-local";
      const client = new AgarthaClient(baseUrl, token, fetch, { backend, agentId: requiredOption(command, "agent") });
      if (command.subcommand === "refill-energy") {
        printJson(await client.adminRefillEnergy(requiredOption(command, "agent"), optionalNumberOption(command, "amount")), io.stdout);
        return 0;
      }
      throw new Error(`Unknown admin command ${command.subcommand ?? ""}`.trim());
    }

    const agentId = requiredOption(command, "agent");
    const token = tokenForAgent(agentId, command, env);
    const client = new AgarthaClient(baseUrl, token, fetch, { backend, agentId });

    if (command.command === "observe") {
      printJson(await runObserve(client), io.stdout);
      return 0;
    }

    if (command.command === "quote") {
      printJson(await client.quote(actionEnvelope(command)), io.stdout);
      return 0;
    }

    if (command.command === "act") {
      printJson(await client.act(actionEnvelope(command)), io.stdout);
      return 0;
    }

    if (command.command === "chunk") {
      printJson(await runChunk(client, command), io.stdout);
      return 0;
    }

    if (command.command === "events") {
      printJson(await runEvents(client, command), io.stdout);
      return 0;
    }

    if (command.command === "watch") {
      return await runWatch(client, command, io.stdout);
    }

    throw new Error(`Unknown command ${command.command}`);
  } catch (error) {
    const body = errorBody(error);
    printJson(body, io.stderr);
    return exitCodeFor(body.reason);
  }
}

function help() {
  return {
    commands: [
      "observe --agent <agent-id>",
      "quote place-material --agent <agent-id> --x <x> --y <y> --material <paint|stone|water|fire|plant>",
      "act place-material --agent <agent-id> --x <x> --y <y> --material <paint|stone|water|fire|plant>",
      "act paint-cells --agent <agent-id> --cells \"65,65 66,65\"",
      "act move --agent <agent-id> --x <x> --y <y>",
      "act submit-note --agent <agent-id> --body <text> [--x <x> --y <y>]",
      "chunk --agent <agent-id> --chunk <x:y>",
      "events --agent <agent-id> [--limit <n>]",
      "watch --agent <agent-id> --chunk <x:y> [--radius <0-4>]",
      "admin refill-energy --agent <agent-id> [--amount <n>] [--admin-token <token>]",
    ],
    output: "json",
  };
}

function requiredEnv(name: string, env: Record<string, string | undefined>) {
  const value = env[name];
  if (!value) throw new Error(`${name} is required when AGARTHA_BACKEND=convex`);
  return value;
}

function runWatch(
  client: AgarthaClient,
  command: ReturnType<typeof parseArgs>,
  stdout: Pick<typeof process.stdout, "write">,
): Promise<number> {
  if (!client.isConvexBackend() && typeof WebSocket === "undefined") {
    throw new Error("WebSocket is unavailable in this Node runtime");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let socket: WebSocket;
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      resolve(code);
    };

    socket = client.watch(watchRequest(command), {
      onClose: () => finish(0),
      onError: (error) => {
        if (!settled) reject(error);
      },
      onMessage: (message) => {
        stdout.write(`${JSON.stringify(message)}\n`);
        if (command.options.has("once")) {
          socket.close();
          finish(0);
        }
      },
    });
  });
}

const isEntryPoint = import.meta.url === `file://${process.argv[1]}`;
if (isEntryPoint) {
  const code = await runCli(process.argv.slice(2));
  process.exitCode = code;
}
