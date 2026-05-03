import type { ActionEnvelope } from "@agartha/protocol/actions";

import { AgarthaClient } from "../client";
import { parseCells, requiredOption, targetCoord, materialOption, optionalOption, type ParsedCommand } from "../parse";

export function clientFor(command: ParsedCommand, env: Record<string, string | undefined>, token: string) {
  return new AgarthaClient(env.AGARTHA_SERVER_URL ?? "http://127.0.0.1:8787", token);
}

export async function runObserve(client: AgarthaClient) {
  return client.observe();
}

export function actionEnvelope(command: ParsedCommand): ActionEnvelope {
  const agentId = requiredOption(command, "agent");
  const expectedChunkVersion = optionalOption(command, "expected-version");
  const base = {
    agentId,
    expectedChunkVersion: expectedChunkVersion === undefined ? undefined : Number(expectedChunkVersion),
    quoteId: optionalOption(command, "quote-id"),
    worldId: "origin" as const,
  };

  if (command.subcommand === "place-material") {
    return {
      ...base,
      actionType: "place_material",
      payload: {
        material: materialOption(command),
        target: targetCoord(command),
      },
    };
  }

  if (command.subcommand === "paint-cells") {
    return {
      ...base,
      actionType: "paint_cells",
      payload: {
        cells: parseCells(command),
      },
    };
  }

  if (command.subcommand === "move") {
    return {
      ...base,
      actionType: "move",
      payload: {
        to: targetCoord(command),
      },
    };
  }

  if (command.subcommand === "submit-note") {
    return {
      ...base,
      actionType: "submit_note",
      payload: {
        body: requiredOption(command, "body"),
        target: command.options.has("x") && command.options.has("y") ? targetCoord(command) : undefined,
      },
    };
  }

  throw new Error(`Unknown action ${command.subcommand ?? ""}`.trim());
}
