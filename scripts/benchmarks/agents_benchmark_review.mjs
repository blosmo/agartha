/** One blinded review of the actual exported artifacts, independent of builders. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAPIResponse } from "./agents_benchmark_protocol.mjs";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const directory = path.join(root, ".agartha/agents-api-benchmark/pilot-2");
const output = path.join(directory, "independent-review.json");
if (fs.existsSync(output))
  throw new Error("Review already attempted; inspect it before retrying.");
const key =
  process.env.OPENAI_API_KEY ||
  fs
    .readFileSync(path.join(root, ".env.local"), "utf8")
    .match(/^OPENAI_API_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1];
const content = [
  {
    type: "input_text",
    text: `Compare two Blender chair exports from neutral hero and side views. A and B each received this brief: Original sculptural lounge chair, two continuous curved walnut side frames, thick sage-green seat around .4m high and visibly reclined backrest, around .8m wide, convincing connections, rounded cushions, comfortable silhouette. Give each 0-5 for brief match, structural plausibility, silhouette, and materials/detail; total /20. Identify visible defects and select a winner or tie. Judge only visible evidence, do not infer dimensions or mesh health from images. No knowledge of which API made each. Answer concisely in plain text.`,
  },
];
// Fixed assignment recorded separately; labels reveal no API identity to the reviewer.
const assignment = { A: "responses", B: "agents" };
for (const [label, arm] of Object.entries(assignment)) {
  for (const view of ["hero", "right"]) {
    content.push({ type: "input_text", text: `${label}, ${view} view` });
    content.push({
      type: "input_image",
      image_url:
        "data:image/png;base64," +
        fs
          .readFileSync(
            path.join(
              root,
              ".agartha/agents-api-benchmark",
              arm === "agents" ? "pilot-3" : "pilot-2",
              arm,
              `export_${view}.png`,
            ),
          )
          .toString("base64"),
    });
  }
}
fs.writeFileSync(
  output,
  JSON.stringify({
    status: "submitted",
    assignment,
    startedAt: new Date().toISOString(),
  }),
);
const response = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + key,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-6-astra",
    reasoning: { effort: "low" },
    service_tier: "default",
    store: false,
    max_output_tokens: 1600,
    input: [{ role: "user", content }],
  }),
  signal: AbortSignal.timeout(120000),
});
const result = await parseAPIResponse(response);
fs.writeFileSync(output, JSON.stringify({ assignment, result }, null, 2));
console.log(
  JSON.stringify({
    status: result.status,
    usage: result.usage,
    text: result.output
      .filter((o) => o.type === "message")
      .flatMap((o) => o.content)
      .map((c) => c.text)
      .join("\n"),
  }),
);
