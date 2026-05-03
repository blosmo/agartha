import type { CollaborationEnvelope, CollaborationResponseEnvelope } from "@agartha/protocol/collaboration";

import type { AgarthaClient } from "../client";
import { optionalNumberOption, optionalOption, requiredOption, type ParsedCommand } from "../parse";

export async function runCollaboration(
  client: AgarthaClient,
  command: ParsedCommand,
  agentId: string,
): Promise<CollaborationResponseEnvelope> {
  const operation = normalizeOperation(command.subcommand);
  const envelope: CollaborationEnvelope = {
    operation,
    worldId: "origin",
    agentId,
    payload: payloadFor(operation, command),
  };
  return client.collaborate(envelope);
}

function normalizeOperation(subcommand: string | undefined): CollaborationEnvelope["operation"] {
  switch (subcommand) {
    case "enter":
    case "leave":
    case "heartbeat":
    case "presence":
    case "messages":
    case "say":
    case "project":
    case "summary":
    case "context":
      return subcommand;
    case undefined:
      return "context";
    default:
      throw new Error(`Unknown collab command ${subcommand}`);
  }
}

function payloadFor(operation: CollaborationEnvelope["operation"], command: ParsedCommand): Record<string, unknown> {
  switch (operation) {
    case "say":
      return { body: requiredOption(command, "body") };
    case "project":
      return {
        projectId: optionalOption(command, "project-id"),
        title: optionalOption(command, "title"),
        kind: optionalOption(command, "kind") ?? "update",
        body: requiredOption(command, "body"),
        expectedVersion: optionalNumberOption(command, "expected-version"),
      };
    case "summary":
      return {
        body: requiredOption(command, "body"),
        status: optionalOption(command, "status") ?? "decision",
      };
    default:
      return {};
  }
}
