# Reference-guided hosted modeling

The gallery must contain actual service outputs. Local procedural examples and generated concept images do not establish the hosted service's modeling quality.

## Authorized workflow

1. A submitted job can request generated visual references. Pin `openai/gpt-image-2.5-flare`; generate one consistent four-view sheet before starting the Blender clock.
2. Charge reference generation within the submitted total budget using the existing single-use inference reservation ledger. Keep ambiguous requests pending reconciliation; never retry them automatically.
3. Retain the reference artifact privately with the job. Give Astra labeled reference views on every modeling/review turn, separate from rendered evidence.
4. Let Astra choose Blender MCP actions: inspect scene, inspect object, edit, render selected views, accept a checkpoint, restore the accepted checkpoint, or finish.
5. Edits must be followed by rendered evidence. Multi-view inspection must not overwrite the model's hero camera. Keep named objects and persistent scene state for targeted changes.
6. A technically valid export is a candidate, not an aesthetically accepted model. Keep accepted and latest candidate checkpoints distinct. Finishing requires inspection of the current candidate.
7. Keep an audit trail of actions, critiques, inspected views, and acceptance decisions. Serve the trace alongside actual Blender-generated artifacts.
8. Reference-guided jobs reserve a 30-minute compute session within the same total cap, with enough time for modeling and review before optional turnaround rendering. Legacy jobs keep their existing protocol and reservation.
9. Preserve owner authentication, cancellation, byte/dimension bounds, allowed artifact names, and ledger reconciliation across the new paths.
10. Populate the public gallery only after an actual hosted run is reviewed, with provenance linking the example to its job and delivered files. The AI-generated reference sheet is labeled as a reference, never a Blender render.

## Verified provider contract

On September 9, 2026, the Gateway catalog lists `openai/gpt-image-2.5-flare` as an image-only model. Use `/v1/images/generations`, fixed size/quality, one image, and actual response usage. Official token rates are $5/M text input, $8/M image input, and $30/M image output. The OpenAI image-generation guide's calculator uses a quality grid of 16/24/48/64/96 for low/medium/high/xhigh/max. Use the maximum grid at the pinned dimensions for a conservative output allowance, even though the request selects high quality.

Sources: https://vercel.com/docs/ai-gateway/modalities/image-generation/openai and https://developers.openai.com/api/docs/guides/image-generation

## Rollout and acceptance

Local verification: 52 TypeScript/ledger/UI tests, 16 Python workflow/storage tests, native Blender multi-view rendering checks, type checks and web build. Browser verification uses mocked read-only capability/pricing responses; it proves UI behavior, not hosted generation.

Deployment order: keep public reference admission disabled; deploy the additive Convex schema and mutations, then the Modal broker/worker (50-minute outer timeout), then the Vercel gateway/UI. Configure only the intended operator identity for reference admission. Verify that identity can discover and submit reference jobs while anonymous and other identities cannot. Existing non-reference jobs retain their legacy protocol.

The current live test identity has no available credits. Before a hosted benchmark, fund its normal live wallet through checkout. Run one reference-guided benchmark with a $10 total cap, using GPT Image 2.5 Flare and GPT-6 Astra. Inspect actual usage settlement, the generated sheet, Blender views, model.glb/model.blend and review.json; check cancellation and recovery evidence. Approve gallery quality only from those actual artifacts. Continue to further gallery examples only within approved available funds. Public reference activation and gallery publication require a separate release decision after this verification.

Object creation takes priority over video. Both modeling workflows reserve only 90 seconds for delivery instead of six minutes. Optional video starts only with at least three minutes spare, uses a 24-frame two-second orbit, and stops scheduling chunks when its own time window is nearly exhausted. Model files and still previews remain available when video is skipped.
