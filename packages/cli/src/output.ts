import { AgarthaApiError } from "./client";

export interface CliErrorBody {
  readonly ok: false;
  readonly reason: string;
  readonly message: string;
  readonly status?: number;
}

export function printJson(value: unknown, writer: Pick<typeof process.stdout, "write"> = process.stdout) {
  writer.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function errorBody(error: unknown): CliErrorBody {
  if (error instanceof AgarthaApiError) {
    return {
      ok: false,
      ...error.body,
    };
  }
  if (error instanceof Error) {
    return {
      ok: false,
      message: redactToken(error.message),
      reason: "cli_error",
    };
  }
  return {
    ok: false,
    message: "Unknown CLI error",
    reason: "cli_error",
  };
}

export function exitCodeFor(reason: string) {
  switch (reason) {
    case "unauthenticated":
    case "permission_denied":
      return 3;
    case "malformed":
    case "invalid_target":
    case "cli_error":
      return 2;
    case "insufficient_energy":
    case "stale_chunk_version":
    case "illegal_material_overwrite":
    case "out_of_range":
      return 4;
    default:
      return 1;
  }
}

function redactToken(value: string) {
  return value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]");
}
