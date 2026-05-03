import { describe, expect, it } from "vitest";

import { MATERIAL, toWorldCoord } from "@agartha/protocol/world";

import {
  DEFAULT_SERVER_CHUNKS,
  ServerWorldError,
  fetchServerWorldSnapshot,
  readServerWorldConfig,
} from "./worldClient";

describe("worldClient", () => {
  it("reads explicit server-backed configuration from Vite env", () => {
    expect(readServerWorldConfig({})).toBeUndefined();

    expect(
      readServerWorldConfig({
        VITE_AGARTHA_READ_TOKEN: "token-moss",
        VITE_AGARTHA_SERVER_URL: "http://127.0.0.1:8787/",
      }),
    ).toEqual({
      baseUrl: "http://127.0.0.1:8787",
      token: "token-moss",
    });
  });

  it("requires an explicit read token before fetching server state", async () => {
    await expect(fetchServerWorldSnapshot({ baseUrl: "http://127.0.0.1:8787", token: "" })).rejects.toMatchObject({
      reason: "missing_token",
    });
  });

  it("loads events and the default board chunks as demo cells", async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = async (url: string | URL | Request) => {
      requestedUrls.push(String(url));

      if (String(url).endsWith("/events")) {
        return jsonResponse([{ id: "event-0001", tick: 7, summary: "Agent placed paint" }]);
      }

      return jsonResponse({
        worldId: "origin",
        chunk: { x: 0, y: 0 },
        version: 3,
        cells: [
          {
            coord: toWorldCoord(4, 5),
            flags: 0,
            material: MATERIAL.Paint,
            state: 0,
            variant: 2,
          },
        ],
      });
    };

    const snapshot = await fetchServerWorldSnapshot(
      { baseUrl: "http://127.0.0.1:8787", token: "token-moss" },
      fetchImpl as typeof fetch,
    );

    expect(requestedUrls).toContain("http://127.0.0.1:8787/events");
    for (const chunk of DEFAULT_SERVER_CHUNKS) {
      expect(requestedUrls).toContain(`http://127.0.0.1:8787/chunks/${chunk.x}/${chunk.y}`);
    }
    expect(snapshot.events).toEqual([{ id: "event-0001", tick: 7, summary: "Agent placed paint" }]);
    expect(snapshot.cells[0]).toMatchObject({
      id: "4:5",
      material: MATERIAL.Paint,
      variant: 2,
    });
  });

  it("preserves structured request failure details", async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => '{"reason":"unauthenticated"}',
    });

    await expect(
      fetchServerWorldSnapshot(
        { baseUrl: "http://127.0.0.1:8787", token: "bad-token", chunks: [{ x: 0, y: 0 }] },
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toEqual(new ServerWorldError("request_failed", '{"reason":"unauthenticated"}', 401));
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  };
}
