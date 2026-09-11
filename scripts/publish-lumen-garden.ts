/** Publish the reviewed local Lumen assets and composition. Requires explicit release approval. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  publishBlenderAsset,
  validateUploadUrl,
} from "./lib/publishBlenderAsset.js";
import {
  components,
  durableEdit,
  matches,
  record,
  string,
  version,
} from "./lib/lumenPublication.js";
import {
  lumenObjects,
  LUMEN_NAME,
  LUMEN_BRIEF,
  LUMEN_ENVIRONMENT,
} from "./seed/lumen_objects.js";
const base = "https://www.agartha.place",
  root = new URL("../.agartha/lumen-garden/", import.meta.url),
  path = (name: string) => new URL(name, root).pathname;
const identity = record(
  JSON.parse(
    await readFile(new URL("../starter-studio-operator.json", root), "utf8"),
  ),
);
const token = string(identity.token);
const manifest = {
  components: components(
    JSON.parse(await readFile(path("manifest.json"), "utf8")),
  ),
};
const api = async (route: string, body?: unknown) => {
  const r = await fetch(base + route, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw Error(`API ${route} returned ${r.status}`);
  return record(await r.json());
};
const mode = process.argv[2];
if (!process.argv.includes("--publish"))
  throw Error("Publication requires --publish after release approval.");
if (mode === "bundle" || mode === "water") {
  const water = mode === "water";
  const result = await publishBlenderAsset({
    server: base,
    token: token,
    model: path(water ? "water-model.glb" : "scene.glb"),
    source: path(water ? "water-source.blend" : "model.blend"),
    preview: path(water ? "water-preview.png" : "preview.png"),
    statePath: path(`${mode}-publication-state.json`),
    metadata: {
      name: water ? "Lumen reflecting water" : LUMEN_NAME,
      description: water
        ? "A subtle six-second native morph animation for reflecting water."
        : "Original full-cell garden station with a terrace cafe, planting, orbital lantern and separate transit pod. Source geometry is MIT; shared material maps are CC0.",
      license: "MIT",
      attribution:
        "Agartha Studio. Original Blender geometry, shared Agartha CC0 material catalog.",
    },
  });
  await writeFile(
    path(`${mode}-published.json`),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} else if (mode === "component") {
  const part = manifest.components.find((p) => p.name === process.argv[3]);
  if (!part) throw Error("Unknown component");
  const bundle = record(
      JSON.parse(await readFile(path("bundle-published.json"), "utf8")),
    ),
    bytes = await readFile(path(part.name + ".glb")),
    id = "model-" + createHash("sha256").update(bytes).digest("hex");
  const existing = await fetch(`${base}/api/models/${id}`, {
    redirect: "error",
    signal: AbortSignal.timeout(60000),
  });
  if (existing.status === 404) {
    const caps = await api("/api/assets/capabilities");
    const ticket = await api("/api/models/upload-ticket", {
      name: `${LUMEN_NAME}: ${part.name}`,
      description: "A separate reusable component of Lumen Garden Station.",
      license: "MIT; material maps CC0",
      attribution: "Agartha Studio",
      source: string(bundle.sourceUrl),
    });
    if (
      !/^[a-f0-9]{64}$/.test(string(ticket.uploadToken)) ||
      ticket.uploadToken === token ||
      typeof ticket.expiresAt !== "number" ||
      ticket.expiresAt <= Date.now()
    )
      throw Error("Invalid upload ticket");
    validateUploadUrl(
      string(ticket.uploadUrl),
      string(caps.uploadOrigin),
      "/model-upload",
    );
    const upload = await fetch(string(ticket.uploadUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${string(ticket.uploadToken)}`,
        "Content-Type": "model/gltf-binary",
      },
      body: bytes,
      redirect: "error",
      signal: AbortSignal.timeout(60000),
    });
    await upload.body?.cancel();
    if (!upload.ok) throw Error(`Component upload returned ${upload.status}`);
  } else if (!existing.ok)
    throw Error(`Model read returned ${existing.status}`);
  await existing.body?.cancel();
  const saved = await api(`/api/models/${id}`);
  if (saved.id !== id) throw Error("Model identity mismatch");
  console.log(JSON.stringify({ component: part.name, modelId: id }));
} else if (mode === "place") {
  const roomId = "plot-4--3";
  let room: Record<string, unknown>;
  const observed = await api("/api/plots?x=4&z=-3&view=summary");
  const candidate = await fetch(base + "/api/plots/" + roomId, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "error",
    signal: AbortSignal.timeout(60000),
  });
  if (candidate.status === 404) {
    if (
      !Array.isArray(observed.empty) ||
      !observed.empty.some((p) => record(p).id === roomId)
    )
      throw Error("Target cell is no longer empty");
    room = await api("/api/plots", { x: 4, z: -3, name: LUMEN_NAME });
  } else {
    if (!candidate.ok) throw Error("Room read failed");
    room = record(await candidate.json());
  }
  room = await api("/api/plots/" + roomId);
  if (
    room.name !== LUMEN_NAME ||
    record(room.permissions).canEditEnvironment !== true
  )
    throw Error("Room ownership does not match");
  const ids: Record<string, string> = {};
  for (const part of manifest.components) {
    ids[part.name] =
      "model-" +
      createHash("sha256")
        .update(await readFile(path(part.name + ".glb")))
        .digest("hex");
    await api("/api/models/" + ids[part.name]);
  }
  const water = record(
    JSON.parse(await readFile(path("water-published.json"), "utf8")),
  );
  if (
    water.modelId !==
    "model-" +
      createHash("sha256")
        .update(await readFile(path("water-model.glb")))
        .digest("hex")
  )
    throw Error("Water identity mismatch");
  await api("/api/models/" + string(water.modelId));
  const objects = lumenObjects(manifest.components, ids, {
    modelId: string(water.modelId),
    clip: "WaterCurrent",
  });
  const savedObjects = () => {
    if (!Array.isArray(room.objects)) throw Error("Invalid room objects");
    return room.objects.map(record);
  };
  const owner = string(record(room.permissions).agentId);
  const binding = JSON.stringify({
    base,
    actor: createHash("sha256").update(token).digest("hex"),
    roomId,
    objects,
    environment: LUMEN_ENVIRONMENT,
  });
  if (
    savedObjects().some(
      (o) => o.owner !== owner || !objects.some((x) => x.id === o.id),
    )
  )
    throw Error("Room has unrelated objects");
  if (room.brief !== LUMEN_BRIEF) {
    if (room.brief) throw Error("Refusing to overwrite another brief");
    await api("/api/plots/" + roomId, {
      brief: LUMEN_BRIEF,
      expectedBriefVersion: version(room.briefVersion),
    });
  }
  room = await api("/api/plots/" + roomId);
  if (
    !objects.every((o) =>
      savedObjects().some((actual) => matches(actual, { ...o, owner })),
    )
  )
    await durableEdit(
      path("objects-placement-state.json"),
      binding,
      {
        message: "Created the reviewed Lumen Garden Station benchmark.",
        expectedVersions: Object.fromEntries(objects.map((o) => [o.id, 0])),
        objects,
      },
      (body) => api("/api/plots/" + roomId, body),
    );
  room = await api("/api/plots/" + roomId);
  if (
    !matches(
      { environment: room.environment },
      { environment: LUMEN_ENVIRONMENT },
    )
  )
    await durableEdit(
      path("environment-placement-state.json"),
      binding,
      {
        message: "Applied the reviewed room atmosphere.",
        expectedEnvironmentVersion: 0,
        environment: LUMEN_ENVIRONMENT,
      },
      (body) => api("/api/plots/" + roomId, body),
    );
  room = await api("/api/plots/" + roomId);
  if (
    savedObjects().length !== objects.length ||
    !objects.every((o) =>
      savedObjects().some((actual) => matches(actual, { ...o, owner })),
    )
  )
    throw Error("Saved object mismatch");
  if (
    !matches(
      { environment: room.environment },
      { environment: LUMEN_ENVIRONMENT },
    ) ||
    room.brief !== LUMEN_BRIEF
  )
    throw Error("Saved environment mismatch");
  const result = {
    roomId,
    url: base + "/?plot=" + roomId,
    version: room.version,
    environmentVersion: room.environmentVersion,
    objectVersions: room.objectVersions,
    objects: room.objects,
    environment: room.environment,
  };
  await writeFile(path("placed.json"), JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      roomId,
      url: result.url,
      objects: objects.length,
      version: room.version,
    }),
  );
} else
  throw Error(
    "Choose bundle, water, component NAME or place. Production approval is required.",
  );
