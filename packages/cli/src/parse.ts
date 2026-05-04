import { MATERIAL, toWorldCoord, type ChunkCoord, type MaterialId, type WorldCoord } from "@agartha/protocol/world";

export interface ParsedCommand {
  readonly command: string;
  readonly subcommand?: string;
  readonly options: Map<string, string | true>;
  readonly positionals: string[];
}

export function parseArgs(argv: readonly string[]): ParsedCommand {
  const [command = "help", maybeSubcommand, ...rest] = argv;
  const hasSubcommand = maybeSubcommand !== undefined && !maybeSubcommand.startsWith("--");
  const args = hasSubcommand ? rest : argv.slice(1);
  const options = new Map<string, string | true>();
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = args[index + 1];
    if (next === undefined || next.startsWith("--")) {
      options.set(key, true);
    } else {
      options.set(key, next);
      index += 1;
    }
  }

  return {
    command,
    subcommand: hasSubcommand ? maybeSubcommand : undefined,
    options,
    positionals,
  };
}

export function requiredOption(command: ParsedCommand, name: string): string {
  const value = command.options.get(name);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing --${name}`);
  }
  return value;
}

export function optionalOption(command: ParsedCommand, name: string): string | undefined {
  const value = command.options.get(name);
  return typeof value === "string" ? value : undefined;
}

export function numberOption(command: ParsedCommand, name: string): number {
  const value = Number(requiredOption(command, name));
  if (!Number.isFinite(value)) throw new Error(`Invalid --${name}`);
  return Math.round(value);
}

export function optionalNumberOption(command: ParsedCommand, name: string): number | undefined {
  const value = optionalOption(command, name);
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid --${name}`);
  return Math.round(number);
}

export function materialOption(command: ParsedCommand): Exclude<MaterialId, typeof MATERIAL.Empty> {
  const material = requiredOption(command, "material").toLowerCase();
  const id = materialNameToId(material);
  if (id === undefined || id === MATERIAL.Empty) throw new Error(`Unknown material ${material}`);
  return id;
}

export function targetCoord(command: ParsedCommand): WorldCoord {
  return toWorldCoord(numberOption(command, "x"), numberOption(command, "y"));
}

export function parseCells(command: ParsedCommand): WorldCoord[] {
  const raw = requiredOption(command, "cells");
  return raw.split(/\s+/).filter(Boolean).map(parseCellToken);
}

export function parseChunk(command: ParsedCommand): ChunkCoord {
  const raw = requiredOption(command, "chunk");
  const [x, y] = raw.split(":").length === 2 ? raw.split(":") : raw.split(",");
  const chunkX = Number(x);
  const chunkY = Number(y);
  if (!Number.isInteger(chunkX) || !Number.isInteger(chunkY)) {
    throw new Error(`Invalid --chunk ${raw}`);
  }
  return { x: chunkX, y: chunkY };
}

export function tokenForAgent(agentId: string, command: ParsedCommand, env: Record<string, string | undefined>): string {
  const explicit = optionalOption(command, "token");
  if (explicit) return explicit;
  if (env.AGARTHA_TOKEN) return env.AGARTHA_TOKEN;

  const normalized = agentId
    .replace(/^agent-/, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toUpperCase();
  const agentToken = env[`AGARTHA_TOKEN_${normalized}`];
  if (agentToken) return agentToken;

  if (agentId === "agent-moss-archivist") return env.MOSS_TOKEN ?? "token-moss";
  if (agentId === "agent-firebreak-builder") return env.FIREBREAK_TOKEN ?? "token-firebreak";
  if (agentId === "agent-stream-gardener") return env.GARDENER_TOKEN ?? "token-gardener";
  if (agentId === "agent-hermes-cartographer") return env.HERMES_CARTOGRAPHER_TOKEN ?? "token-hermes-cartographer";
  if (agentId === "agent-hermes-steward") return env.HERMES_STEWARD_TOKEN ?? "token-hermes-steward";
  throw new Error(`No token found for ${agentId}`);
}

function parseCellToken(token: string): WorldCoord {
  const [x, y] = token.split(":").length === 2 ? token.split(":") : token.split(",");
  const absoluteX = Number(x);
  const absoluteY = Number(y);
  if (!Number.isFinite(absoluteX) || !Number.isFinite(absoluteY)) {
    throw new Error(`Invalid cell coordinate ${token}`);
  }
  return toWorldCoord(Math.round(absoluteX), Math.round(absoluteY));
}

function materialNameToId(name: string): MaterialId | undefined {
  switch (name) {
    case "empty":
      return MATERIAL.Empty;
    case "paint":
      return MATERIAL.Paint;
    case "stone":
      return MATERIAL.Stone;
    case "water":
      return MATERIAL.Water;
    case "fire":
      return MATERIAL.Fire;
    case "plant":
      return MATERIAL.Plant;
    default:
      return undefined;
  }
}
