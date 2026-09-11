import { readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { LumenComponent } from "../seed/lumen_objects.js";

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Expected an object.");
  return value as Record<string, unknown>;
}
export function string(value: unknown): string {
  if (typeof value !== "string" || !value)
    throw Error("Expected a nonempty string.");
  return value;
}
export function version(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw Error("Invalid version.");
  return value;
}
export function components(value: unknown): LumenComponent[] {
  const parts = record(value).components;
  if (!Array.isArray(parts) || parts.length !== 8)
    throw Error("Expected eight reviewed components.");
  return parts.map((value) => {
    const part = record(value),
      name = string(part.name);
    if (!/^[a-z][a-z-]{0,40}$/.test(name))
      throw Error("Invalid component name.");
    const tuple = (value: unknown) => {
      if (
        !Array.isArray(value) ||
        value.length !== 3 ||
        !value.every((n) => typeof n === "number" && Number.isFinite(n))
      )
        throw Error("Invalid component transform.");
      return value as number[];
    };
    return { name, position: tuple(part.position), scale: tuple(part.scale) };
  });
}
/** Save the exact CAS payload before sending. An ambiguous response can only replay it. */
export async function durableEdit(
  path: string,
  binding: string,
  payload: Record<string, unknown>,
  send: (body: Record<string, unknown>) => Promise<unknown>,
) {
  const fingerprint = createHash("sha256").update(binding).digest("hex");
  let state: Record<string, unknown>;
  try {
    state = record(JSON.parse(await readFile(path, "utf8")));
    if (state.fingerprint !== fingerprint)
      throw Error("Publication state belongs to another actor or composition.");
    record(state.payload);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    state = {
      fingerprint,
      payload: { ...payload, requestId: randomUUID(), issuedAt: Date.now() },
    };
    await writeFile(path, JSON.stringify(state, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
  }
  return send(record(state.payload));
}
/** Compare desired fields, allowing only server-owned metadata to be added. */
export function matches(
  actual: unknown,
  desired: Record<string, unknown>,
): boolean {
  const saved = record(actual);
  return Object.entries(desired).every(([key, value]) =>
    isDeepStrictEqual(saved[key], value),
  );
}
