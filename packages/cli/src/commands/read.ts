import { AgarthaClient } from "../client";
import { optionalNumberOption, parseChunk, type ParsedCommand } from "../parse";

export async function runChunk(client: AgarthaClient, command: ParsedCommand) {
  return client.chunk(parseChunk(command));
}

export async function runEvents(client: AgarthaClient, command: ParsedCommand) {
  return client.events(optionalNumberOption(command, "limit"));
}

export function watchRequest(command: ParsedCommand) {
  const radiusChunks = optionalNumberOption(command, "radius") ?? 0;
  if (radiusChunks < 0 || radiusChunks > 4) {
    throw new Error("--radius must be between 0 and 4");
  }

  return {
    chunk: parseChunk(command),
    radiusChunks,
  };
}
