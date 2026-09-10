import { afterEach, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PlaygroundStore } from "./playgroundStore";
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
test("durable identities, idempotent votes and reviewed attribution", async () => {
  const dir = await mkdtemp(join(tmpdir(), "playground-"));
  dirs.push(dir);
  const file = join(dir, "state.json"),
    a = new PlaygroundStore(file);
  const creator = await a.session("Creator"),
    guest = await a.session("Guest");
  const project = await a.mutate(creator, "create", {
    requestId: "create",
    title: "Diner",
    brief: "For astronauts",
    authorId: guest.agentId,
  });
  const id = project.project.projectId;
  expect(project.project.creatorId).toBe(creator.agentId);
  const b = new PlaygroundStore(file);
  expect(await b.viewer(creator.agentToken)).toEqual({
    agentId: creator.agentId,
    name: "Creator",
  });
  await Promise.all([
    a.mutate(guest, "vote", { requestId: "vote", voted: true }, id),
    b.mutate(guest, "vote", { requestId: "vote", voted: true }, id),
  ]);
  expect((await b.get(id, guest)).project.votes).toBe(1);
  await expect(
    b.mutate(guest, "vote", { requestId: "vote", voted: false }, id),
  ).rejects.toThrow("requestId");
  await expect(
    b.mutate(guest, "update", { requestId: "edit", title: "Stolen" }, id),
  ).rejects.toThrow("creator");
  const offer = await b.mutate(
    guest,
    "contribute",
    { requestId: "offer", description: "A jukebox", authorId: creator.agentId },
    id,
  );
  const reviewed = await a.mutate(
    creator,
    "review",
    { requestId: "review", status: "accepted" },
    id,
    offer.contributions[0].contributionId,
  );
  expect(reviewed.contributions[0]).toMatchObject({
    authorId: guest.agentId,
    status: "accepted",
  });
  expect((await b.get(id, guest)).project.canManage).toBe(false);
});
test("rejects unsafe URLs and unfunded build transitions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "playground-"));
  dirs.push(dir);
  const store = new PlaygroundStore(join(dir, "state.json")),
    v = await store.session("Maker");
  await expect(
    store.mutate(v, "create", {
      requestId: "bad",
      title: "A",
      brief: "B",
      imageUrl: "javascript:alert(1)",
    }),
  ).rejects.toThrow("HTTPS");
  const d = await store.mutate(v, "create", {
    requestId: "ok",
    title: "A",
    brief: "B",
  });
  await expect(
    store.mutate(
      v,
      "update",
      { requestId: "build", status: "funding" },
      d.project.projectId,
    ),
  ).rejects.toThrow("hosted");
});

test("ordinary builds can progress on an existing plot and contributions paginate", async () => {
  const dir = await mkdtemp(join(tmpdir(), "playground-"));
  dirs.push(dir);
  const checked: string[] = [];
  const store = new PlaygroundStore(join(dir, "state.json"), async (id) => {
    checked.push(id);
  });
  const creator = await store.session("Maker");
  const detail = await store.mutate(creator, "create", {
    requestId: "create",
    title: "Room",
    brief: "Shared art",
    plotId: "the-commons",
  });
  const id = detail.project.projectId;
  expect(checked).toEqual(["the-commons"]);
  expect(
    (
      await store.mutate(
        creator,
        "update",
        { requestId: "build", status: "building" },
        id,
      )
    ).project.status,
  ).toBe("building");
  const helper = await store.session("Helper");
  for (let i = 0; i < 25; i++)
    await store.mutate(
      helper,
      "contribute",
      { requestId: `offer-${i}`, description: `Art ${i}` },
      id,
    );
  const first = await store.get(id, creator);
  expect(first.contributions).toHaveLength(24);
  const next = await store.contributions(id, first.contributionCursor);
  expect(next.page).toHaveLength(1);
  expect(next.continueCursor).toBeNull();
  expect(
    (
      await store.mutate(
        creator,
        "update",
        { requestId: "finish", status: "completed" },
        id,
      )
    ).project.status,
  ).toBe("completed");
  await expect(
    store.mutate(
      creator,
      "update",
      { requestId: "reopen", status: "building" },
      id,
    ),
  ).rejects.toThrow("closed");
});

test("recovers a dead writer lock without stealing a live writer lock", async () => {
  const { writeFile, readFile } = await import('node:fs/promises');
  const { randomUUID } = await import('node:crypto');
  const dir = await mkdtemp(join(tmpdir(), 'playground-lock-')); dirs.push(dir);
  const file = join(dir, 'state.json');
  const dead = { pid: 2147483647, nonce: randomUUID() };
  await writeFile(`${file}.lock`, JSON.stringify(dead));
  const stores = [new PlaygroundStore(file), new PlaygroundStore(file)];
  const people = await Promise.all(stores.map((s, i) => s.session(`Recovered ${i}`)));
  expect(people).toHaveLength(2);
  for (const person of people) expect(await stores[0].viewer(person.agentToken)).toMatchObject({ agentId: person.agentId });
  const live = { pid: process.pid, nonce: randomUUID() };
  await writeFile(`${file}.lock`, JSON.stringify(live));
  await expect(stores[0].session('Cannot steal')).rejects.toThrow('busy');
  expect(JSON.parse(await readFile(`${file}.lock`, 'utf8'))).toEqual(live);
});
