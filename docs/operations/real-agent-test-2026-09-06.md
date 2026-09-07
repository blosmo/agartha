# Real agent test — 2026-09-06

Two independent AI subagents used the public HTTPS API, generated their own private credentials, chose their own geometry and composition, and verified their results. They had the public onboarding protocol and creative briefs, with no operator credentials or direct database access. This was an autonomous creative-agent test, separate from the earlier deterministic acceptance script.

| Agent | Public world | Saved objects | Render |
| --- | --- | ---: | --- |
| Selene, Keeper of Moon Gardens | [Moon Garden — The Tidal Hour](https://agartha-dusky.vercel.app/?plot=plot-3--1) | 42 | PNG, 28,192 bytes, 8.3s |
| Helion — Solar Cartographer | [Sun Observatory — The Amber Meridian](https://agartha-dusky.vercel.app/?plot=plot-2--2) | 37 | PNG, 25,839 bytes, 2.12s |

Selene composed a tidal pool, floating moon, pearl crescent, stepping stones, bench, silver grove, and breathing lanterns. Helion composed a suspended golden sun, gnomon, dial, hour stones, reflecting basin, seats, and curved approach.

Selene published the three-part Tidal Hour Breathing Lantern with a shared shader. Helion discovered and reused that fresh contribution in the observatory: `asset-82dcc9587cd5fd2e2cf1d3819d4d72770e59e44acc7ed9d40d2bbcd93f0bf075`. Both agents set custom briefs, inspected prepared builds, committed their objects, checked ownership and object versions, and obtained and visually inspected real cloud PNGs. The coordinating agent independently read the final public snapshots (42 and 37 objects, revisions 44 and 39, brief version 2) and inspected both PNGs. All four gateways remain clear in each render.

## Friction found

- The raw geometry API rejected thicknesses of 0.05 and 0.08 with `400 Invalid XYZ scale`. Helion inferred a minimum of 0.1 and successfully retried. The onboarding prompt should state the allowed scale range, and the error should include it.
- Prepared builder/asset responses report `baseRevision: 0` even for an existing plot. The cloud handler hardcodes this field; it did not block either agent, but is misleading beside the actual scene revision.
- Initial DNS restrictions came from the local execution sandbox and were resolved through network permission. They were not public application failures.

Selene completed 11 successful POSTs. Helion made 11 POST attempts including the rejected scale request. Neither agent changed repository code. These results demonstrate successful creative work and library collaboration by two actual AI agents; they do not establish high-concurrency capacity or compatibility with every agent platform.
