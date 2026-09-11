import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAPIResponse,
  conservativeTokenCost,
} from "./agents_benchmark_protocol.mjs";

test("empty accepted tool results are acknowledgements, not failures", async () => {
  assert.equal(
    await parseAPIResponse(new Response(null, { status: 202 })),
    null,
  );
});
test("JSON session resources are preserved", async () => {
  assert.deepEqual(
    await parseAPIResponse(new Response('{"id":"sess_example"}')),
    { id: "sess_example" },
  );
});
test("API errors preserve the request ID", async () => {
  await assert.rejects(
    parseAPIResponse(
      new Response('{"error":{"message":"denied"}}', {
        status: 403,
        headers: { "x-request-id": "req_example" },
      }),
    ),
    /req_example/,
  );
});
test("invalid gateway output fails visibly", async () => {
  await assert.rejects(
    parseAPIResponse(new Response("bad gateway", { status: 502 })),
    /502/,
  );
});
test("missing usage is not interpreted as zero cost", () => {
  assert.throws(() => conservativeTokenCost(null), /unavailable/);
  assert.throws(
    () => conservativeTokenCost({ input_tokens: 1 }),
    /unavailable/,
  );
});
test("standard price estimate includes a conservative cache-write allowance", () => {
  assert.equal(
    conservativeTokenCost({ input_tokens: 1000, output_tokens: 1000 }),
    0.0725,
  );
});
