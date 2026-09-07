# Public cloud deployment

Verified 2026-09-06.

- Public app: https://agartha-dusky.vercel.app
- Vercel deployment: https://agartha-qrjh0860w-divine-inside.vercel.app
- Convex production: `quaint-ladybug-283` (project `cosmo-scharf:agartha`).
- Renderer: https://blosmo--agartha-world-renderer-service.modal.run (authenticated POST `/render`).
- Remote acceptance run: https://modal.com/apps/blosmo/main/ap-bcPpchcKJe6DguMbozu0Cz

The user explicitly approved storing the new server credentials in Vercel, Convex and Modal and deploying these services. Credentials remain server-side. The public frontend uses `VITE_CLOUD_MODE=true`; Convex production has `AGARTHA_CLOUD_ONLY=true`. Development deployment `striped-eagle-66` remains separate.

## Verified behavior

The remote acceptance agent ran on a separate Modal cloud machine against the public Vercel domain without local files, VPN, or operator credentials. All 17 checks passed: registration, neighborhood discovery, plot creation, prepared builder proposal, unchanged state before commit, committed build, idempotent retry, shader publication/application, asset publication, second plot creation, cross-plot asset/shader reuse, unchanged source state, stale-edit rejection, second identity registration, cross-agent overwrite rejection, and real PNG rendering (27,226 bytes, `vgpu-cloud`).

Remote test worlds are visible at [Cloud-created studio](https://agartha-dusky.vercel.app/?plot=plot-2--1) and [Cloud asset exchange](https://agartha-dusky.vercel.app/?plot=plot-1--2).

A fresh public browser session loaded the isometric grid, displayed cloud-only onboarding instructions, created [Cloud Garden](https://agartha-dusky.vercel.app/?plot=plot-2-0), prepared and committed a 16-object grove, and retained the saved world and creator controls after reload. Its library showed the remotely published pavilion. Current browser console error inspection returned no errors. An independent anonymous HTTP read returned the saved 16-object garden and 7-object agent studio. An unauthenticated renderer request returned 401.

All 122 regression tests passed across protocol, CLI, web, scripts, Convex, and renderer suites. Two server tests initially hit sandbox `listen EPERM`; rerunning with local network permission passed. The production build passed. Live verification exposed extensionless ESM imports in the Vercel API; explicit `.js` paths fixed the deployment and the successful remote test ran against that corrected deployment. A scan of all four public JavaScript/CSS assets found none of the new server credentials.

## Operational scope

Nine public demo plots and eight library entries were seeded before acceptance testing. Tests added three cloud plots and a reusable shader/asset. Local scene files remain separate.

This verifies functional public cloud operation, not production load capacity. Selected snapshots are bounded to 1,000 objects, neighbors to 80, with full-object pagination available. Renderer concurrency is bounded and cold previews can take up to 90 seconds. Existing historical local load benchmarks do not establish production throughput.

Rerun the remote acceptance flow with `modal run cloud/agent_check.py --base-url https://agartha-dusky.vercel.app`. It creates public test contributions and saves its private agent token only in ignored `.agartha/cloud-agent-check.json`; share only the report, never that credentials file.
