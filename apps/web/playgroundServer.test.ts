import { afterEach, expect, test } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PlaygroundStore } from "./playgroundStore";
import { playgroundHandler } from "./playgroundServer";
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
test("cookie and bearer identities persist, cross-origin writes fail and anonymous reads work", async () => {
  const dir = await mkdtemp(join(tmpdir(), "playground-http-"));
  dirs.push(dir);
  const handler = playgroundHandler(
    new PlaygroundStore(join(dir, "state.json")),
  );
  const invoke = async (
    path: string,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
  ) => {
    const session = path.startsWith("/api/session");
    const req = Readable.from(
      body === undefined ? [] : [JSON.stringify(body)],
    ) as IncomingMessage;
    req.url = path.replace(session ? "/api/session" : "/api/playground", "");
    req.method = method;
    req.headers = {
      host: "127.0.0.1:3000",
      ...Object.fromEntries(
        Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
      ),
    };
    Object.assign(req, { socket: { remoteAddress: "127.0.0.1" } });
    const responseHeaders = new Map<string, string>();
    let output = "";
    const res = {
      statusCode: 200,
      setHeader: (k: string, v: string) =>
        responseHeaders.set(k.toLowerCase(), v),
      end: (v: string) => {
        output = v;
      },
    };
    await handler(req, res as unknown as ServerResponse, session);
    return {
      status: res.statusCode,
      headers: { get: (k: string) => responseHeaders.get(k) },
      json: async () => JSON.parse(output),
    };
  };
  const post = (
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ) =>
    invoke(path, "POST", body, {
      "Content-Type": "application/json",
      ...headers,
    });
  expect(
    (
      await post("/api/playground/projects", {
        requestId: "a",
        title: "A",
        brief: "B",
      })
    ).status,
  ).toBe(401);
  const session = await post("/api/session", { name: "Maker" }),
    cookie = session.headers.get("set-cookie")!;
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("SameSite=Strict");
  const identity = await session.json();
  const detail = await (
    await post(
      "/api/playground/projects",
      { requestId: "create", title: "A", brief: "B" },
      { Cookie: cookie.split(";")[0] },
    )
  ).json();
  expect(detail.project.creatorId).toBe(identity.agentId);
  const sessionAgain = await (
    await invoke("/api/session", "GET", undefined, {
      Authorization: `Bearer ${identity.agentToken}`,
    })
  ).json();
  expect(sessionAgain.agentId).toBe(identity.agentId);
  expect(
    (
      await post(
        "/api/playground/projects",
        { requestId: "evil", title: "A", brief: "B" },
        { Origin: "https://evil.test", Cookie: cookie.split(";")[0] },
      )
    ).status,
  ).toBe(403);
  const agentToken = "d".repeat(64);
  const remote = await post("/api/session", { agentToken, name: "Independent agent" });
  expect(remote.status).toBe(200);
  expect(remote.headers.get("set-cookie")).toBeUndefined();
  const remoteIdentity = await remote.json();
  const repeated = await post("/api/session", { agentToken, name: "Different name is not an identity change" });
  expect((await repeated.json()).agentId).toBe(remoteIdentity.agentId);
  const vote = await post(`/api/playground/projects/${detail.project.projectId}/vote`, { requestId: "agent-vote", voted: true }, { Authorization: `Bearer ${agentToken}` });
  expect((await vote.json()).project.votes).toBe(1);
  const page = await (await invoke("/api/playground/projects")).json();
  expect(page.page[0].canManage).toBe(false);
  expect(
    (await (await invoke("/api/playground/pass")).json()).offer.available,
  ).toBe(false);
});
