import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  components,
  durableEdit,
  matches,
  version,
} from "./lumenPublication.js";

test("ambiguous writes replay the original CAS request and reject a different actor", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lumen-publication-"));
  try {
    const sent: Record<string, unknown>[] = [];
    const send = async (body: Record<string, unknown>) => {
      sent.push(body);
      if (sent.length === 1) throw Error("Lost response");
      return {};
    };
    await expect(
      durableEdit(
        join(dir, "state.json"),
        "actor/room/composition",
        { expectedVersions: { object: 0 } },
        send,
      ),
    ).rejects.toThrow("Lost response");
    await durableEdit(
      join(dir, "state.json"),
      "actor/room/composition",
      { expectedVersions: { object: 10 } },
      send,
    );
    expect(sent[1]).toEqual(sent[0]);
    expect(sent[1].requestId).toEqual(expect.any(String));
    await expect(
      durableEdit(join(dir, "state.json"), "different actor", {}, send),
    ).rejects.toThrow("another actor");
    expect(sent).toHaveLength(2);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("rejects malformed manifests before using component names as paths", () => {
  const part = { name: "floor", position: [0, 1, 0], scale: [1, 1, 1] };
  expect(() =>
    components({ components: Array(8).fill({ ...part, name: "../other" }) }),
  ).toThrow("name");
  expect(() =>
    components({
      components: Array(8).fill({ ...part, position: [0, NaN, 0] }),
    }),
  ).toThrow("transform");
  expect(() => version(-1)).toThrow();
});

test("verification includes transforms and motion, regardless of JSON key order", () => {
  const desired = {
    id: "a",
    position: [0, 1, 2],
    motion: { speed: 1, kind: "spin" },
  };
  expect(
    matches(
      { ...desired, motion: { kind: "spin", speed: 1 }, creator: "server" },
      desired,
    ),
  ).toBe(true);
  expect(matches({ ...desired, position: [0, 2, 2] }, desired)).toBe(false);
});

test("matching composition still requires the publishing owner", () => {
  const desired = { id: "lumen-floor", owner: "release-actor" };
  expect(matches({ id: "lumen-floor", owner: "other-curator" }, desired)).toBe(
    false,
  );
});
