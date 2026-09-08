# Paid Blender cost review — September 8, 2026

The approved price is **$0.40 for the first five minutes, then $0.05 per additional begun minute**, retaining the existing data limits. Pricing version `blender-cpu2-v2` is deployed and verified with a real Blender session. The modeled maximum-data contribution is 62.3% for domestic cards and 60.8% for international cards. Live charging remains disabled.

| Scenario | Modeled contribution |
| --- | ---: |
| Observed test sessions at the tested price | 70–86% |
| $0.25 minimum, maximum-size data, domestic card | 45.1% |
| $0.25 minimum, maximum-size data, international card | 43.6% |
| Approved $0.40 minimum, same limits, domestic card | 62.3% |
| Approved $0.40 minimum, same limits, international card | 60.8% |

These are resource-time cost estimates, not an invoice or net-profit claim. Stripe test payments have no real processing fees; the model applies published fees instead. Taxes, support, chargebacks and fixed business costs are excluded.

## Evidence and method

The measured sustained session ran for 310.169 seconds after readiness. It correctly charged six minutes (30 cents) and released 20 cents from a 50-cent reservation. Its conservative worker envelope, measured from the trusted launch claim through confirmed termination, was 325.016 seconds. The model also uses the broker and monitor's full configured resource ceilings throughout that envelope, even though they are not continuously busy.

The short modeling session produced a 61,848-byte GLB and a 163,641-byte PNG, saved its editable project, and settled at 25 cents. The current checkpoint is 641,977 bytes. Resume recovered the model, an idle monitor saved a subsequent edit from a separate container, and another session recovered that edit while handling repeated client reconnects.

The original estimate counted output traveling through the broker to the client. The corrected model also counts checkpoint upload and restore traffic. At maximum limits, one session can move two 256-MiB response legs plus two 256,000,000-byte checkpoint legs. Private container-to-container traffic is billable; reads and writes to Modal Volumes themselves are not. The model prices egress even though September charges and included allowances currently waive it. [Modal egress policy](https://modal.com/docs/guide/network-egress-billing).

Rates used: Sandbox CPU $0.00003942/core-second and memory $0.00000667/GiB-second; Function CPU $0.0000131/core-second and memory $0.00000222/GiB-second; storage $0.09/GiB-month. The worker is configured for two physical cores and 4 GiB with equal requests and limits. [Modal pricing](https://modal.com/pricing), [resource limit semantics](https://modal.com/docs/guide/sandbox-resources).

The model includes 25% worker-compute contingency, seven days of checkpoint storage, and a one-cent per-session allowance for gateway/database costs. Domestic card fees are conservatively rounded to 9% of a $5 top-up; the international scenario adds 1.5 percentage points. Actual account fees must be checked before launch. [Stripe pricing](https://stripe.com/pricing).

The calculation and session measurements are in [paid-blender-costs.json](evidence/paid-blender-costs.json). The test budget calculation deliberately overestimates runtime: full configured worker lifetimes, continuous maximum broker/monitor allocations across the test window, and an additional build/overlap reserve. Its recorded bound remains below the approved $2 limit.

## Live activation gate

The user approved the 40-cent minimum and its unchanged data limits. The modeled envelope now clears the 60% target; this remains a cost model, subject to actual account fees. Live Stripe credentials, a live webhook and matching business profile are also required; no live payment has been attempted.

## Astra observatory verification

Astra designed a 424-object celestial observatory with ten materials, editable curves and meshes, a stone arch, brass armillary and cyan crystal. The paid MCP built it in 8.23 seconds, exported a 1,710,408-byte GLB and a 3,196,730-byte editable Blender file, and rendered a 409,621-byte PNG. The ready-to-stop interval was 48.946 seconds and settled at exactly 40 test cents. Zero Modal workers remained afterward.
