/** Read-only visual baseline capture. PNGs require human inspection alongside the browser. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { components, matches, record, string } from "./lib/lumenPublication.js";
import {
  lumenObjects,
  LUMEN_ENVIRONMENT,
  LUMEN_NAME,
} from "./seed/lumen_objects.js";

const base = process.argv[2] ?? "https://www.agartha.place";
const origin = new URL(base);
if (
  origin.origin !== base ||
  (origin.protocol !== "https:" &&
    !["127.0.0.1", "localhost"].includes(origin.hostname))
)
  throw Error("Use an HTTPS origin or local test server.");
const output = resolve(process.argv[3] ?? ".agartha/lumen-garden/verification");
await mkdir(output, { recursive: true });
const local = new URL("../.agartha/lumen-garden/", import.meta.url);
const token = string(
  record(
    JSON.parse(
      await readFile(new URL("../starter-studio-operator.json", local), "utf8"),
    ),
  ).token,
);
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const parts = components(
  JSON.parse(await readFile(new URL("manifest.json", local), "utf8")),
);
const ids: Record<string, string> = {};
for (const part of parts)
  ids[part.name] =
    "model-" + sha(await readFile(new URL(part.name + ".glb", local)));
const waterId =
  "model-" + sha(await readFile(new URL("water-model.glb", local)));
const expected = lumenObjects(parts, ids, {
  modelId: waterId,
  clip: "WaterCurrent",
});
const request = async (route: string) => {
  const response = await fetch(base + route, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw Error(`${route}: HTTP ${response.status}`);
  return response;
};
const room = record(await (await request("/api/plots/plot-4--3")).json());
if (
  room.name !== LUMEN_NAME ||
  !matches(room, { environment: LUMEN_ENVIRONMENT })
)
  throw Error(
    "Benchmark atmosphere changed. Review before accepting a new baseline.",
  );
if (!Array.isArray(room.objects) || room.objects.length !== expected.length)
  throw Error("Benchmark composition changed.");
const objects = room.objects;
if (!expected.every((o) => objects.some((actual) => matches(actual, o))))
  throw Error("Benchmark model or transform changed.");
await writeFile(resolve(output, "room.json"), JSON.stringify(room, null, 2));
const captures = [];
// Isolate this room to keep neighboring edits from changing the fixed camera or workload.
const focus = expected.map((o) => o.id).join(",");
for (const time of [0, 2]) {
  const view = "top";
  const response = await request(
    `/api/plots/plot-4--3/preview?view=${view}&time=${time}&focus=${focus}`,
  );
  if (
    !response.headers.get("content-type")?.includes("image/png") ||
    response.headers.get("x-agartha-preview-time") !== String(time) ||
    response.headers.get("x-agartha-preview-view") !== view
  )
    throw Error("Preview contract mismatch");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw Error("Invalid PNG");
  const file = `top-${time}.png`;
  await writeFile(resolve(output, file), bytes);
  captures.push({
    file,
    view,
    time,
    sha256: sha(bytes),
    bytes: bytes.length,
    snapshot: response.headers.get("x-agartha-snapshot"),
    lighting: response.headers.get("x-agartha-preview-lighting"),
  });
}
if (captures[0].sha256 === captures[1].sha256)
  throw Error("Timed images are identical; inspect motion.");
const finalRoom = record(await (await request("/api/plots/plot-4--3")).json());
if (finalRoom.version !== room.version)
  throw Error("Room changed during capture; retry with a stable scene.");
const result = {
  capturedAt: new Date().toISOString(),
  base,
  room: room.id,
  version: room.version,
  environment: LUMEN_ENVIRONMENT,
  captures,
  visualAcceptance: "pending browser and PNG inspection",
};
await writeFile(
  resolve(output, "baseline.json"),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
