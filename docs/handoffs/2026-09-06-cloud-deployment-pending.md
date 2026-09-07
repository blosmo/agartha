# Cloud completion — deployment approval pending

> Superseded: the user approved credential storage and deployment on 2026-09-06. Production deployment and remote/browser verification are complete; see [cloud deployment verification](../operations/cloud-deployment.md). The approval boundary below records the earlier state.

## Goal (not achieved yet)

The user requires the complete product to work in the cloud for agents anywhere on the internet, with no further implementation instructions and real end-to-end testing. Do not mark this goal complete based on the local app, mocked tests, or private renderer check alone.

## Approval boundary

Automatic approval review rejected uploading the newly generated renderer authentication secret to Modal and deploying its authenticated web endpoint. It said that exporting this sensitive credential to that specific provider needs explicit approval beyond the broad cloud goal. No credential was uploaded by the rejected command.

A single asynchronous approval question was presented: approve storing the new Agartha server-to-server credentials in Vercel, Convex, and Modal and deploying the authenticated cloud services. No affirmative answer has arrived yet in this goal turn. Do not bypass the rejection, remove authentication to evade it, or infer approval from elapsed time. Continue when the user approves. This is the first goal turn encountering this particular blocking condition; do not mark blocked before the required three-turn audit threshold.

## Implemented

- New Convex cloud sessions and IP registration limits. Browser guests and remote HTTP agents share the same persistent public grid.
- Root session identities can acquire scoped public-plot memberships; derived memberships remain linked to session revocation/expiry. Ownership and object versions protect edits.
- `convex/cloud/http.ts` exposes a server-key-protected bridge; the public Vercel gateway holds that key, never the browser.
- `api/index.ts` maps the existing web API to cloud state, issues HttpOnly/Secure/SameSite browser cookies, accepts remote Bearer sessions, rejects cross-origin cookie writes, and calls the separate preview service.
- The frontend has VITE_CLOUD_MODE, automatic secure sessions, cloud onboarding prompts, object/brief version submission, and ownership-aware controls. Legacy browser navigation is excluded in cloud mode.
- `AGARTHA_CLOUD_ONLY=true` disables archived cellular handlers in production. Public-grid membership cannot bypass root registration using the older invite endpoints.
- Private `cloud/write:bootstrapLibrary` and `bootstrapPlot` functions import only public demo definitions/plots. `scripts/cloud-seed.ts` uses the production deployment and never reads staging credentials.
- Authenticated Modal service code is in `cloud/render_worker.py`; shared image setup in `cloud/image.py`. It has bounded concurrency, request size, subprocess timeouts and image caching. No public endpoint has been deployed yet.
- Remote acceptance agent prepared in `cloud/agent_check.py`. It registers, creates plots, prepares/commits geometry, publishes and reuses an asset/shader, checks stale/ownership rejection, and requests a real PNG. Its private credentials are written to ignored local JSON; only its report is printed.

## Verified

- Complete pre-legacy-gate regression run: 121 tests passed, and the cloud-mode build passed. The additional legacy gate test is running/was run separately; inspect its result before claiming the updated total.
- Cloud gateway cookie/CSRF tests passed; cloud function tests cover root registration, memberships, cross-plot reuse, ownership and version checks.
- A real private Modal renderer check completed successfully at https://modal.com/apps/blosmo/main/ap-kHLBbLWsd5wn0cBpK8ofiK. It rendered a PNG (4,798 bytes) using llvmpipe/Mesa 25.0.7.
- Cloud image fixes: add local Python package source, set Node package type=module, and request maxStorageBuffersInVertexStage=1. The worker image now supports the actual renderer, not just the vgpu doctor probe.
- Public static bundle was scanned against new server credentials; none were present.
- Existing local app/data remain available. It has not been silently switched to remote storage.

## Hosting and secrets (never print values)

- Vercel account: blosmo. Team/scope: divine-inside. Newly linked project: agartha. `.vercel/project.json` exists.
- Modal profile/workspace: blosmo, environment main. New app name: agartha-world-renderer; new secret name: agartha-cloud-render.
- `.agartha/cloud-secrets.json` contains newly generated AGARTHA_CLOUD_GATEWAY_KEY and AGARTHA_RENDER_KEY, mode 0600.
- `.agartha/render-secret.json` contains only AGARTHA_RENDER_KEY for Modal, mode 0600.
- `.vercelignore` excludes .agartha, .env*, .vercel, docs, legacy crates, private configuration and other unnecessary files.
- Existing Convex development deployment is striped-eagle-66. Use the project's production deployment for the public product; keep the private 1,000-agent benchmark world in development.

## After explicit approval

1. Create the Modal secret from `.agartha/render-secret.json`, deploy `cloud/render_worker.py`, and capture its actual `.modal.run` URL. Existing private check apps finished and expose no public endpoint.
2. Deploy Convex production: `npx convex deploy --typecheck disable --cmd 'node scripts/save-cloud-target.mjs' --cmd-url-env-var-name AGARTHA_CLOUD_CONVEX_URL`. Current CLI help does not advertise --yes; use an interactive PTY and answer routine deployment confirmation within the user's authorization if prompted. The hook writes `.agartha/cloud-target.json` with the actual production cloud/site URLs.
3. Set production Convex AGARTHA_CLOUD_GATEWAY_KEY from the private JSON and AGARTHA_CLOUD_ONLY=true. Do not put these values in command text or logs; use structured subprocess arguments and redact captured output.
4. Run `npm run cloud:seed` (production) to import public local demo plots/library. It only reads `.agartha/world.json`, canonical plot JSON files, and library definition files. It does not overwrite existing cloud plots.
5. Set Vercel production env: VITE_CLOUD_MODE=true, AGARTHA_CONVEX_SITE_URL (actual production site URL), AGARTHA_CLOUD_GATEWAY_KEY, AGARTHA_RENDER_URL (actual worker URL), AGARTHA_RENDER_KEY. Secret values go through stdin/structured provider tools, never into public bundles or transcripts.
6. `vercel --prod --yes --scope divine-inside`; inspect the actual production URL and public access. No unrelated Vercel projects should be changed.
7. Run `modal run cloud/agent_check.py --base-url ACTUAL_PUBLIC_URL`, inspect its report, fix any failures and rerun only where justified. Also use a fresh public browser session to test cookie onboarding, cloud grid, creation/library controls and reload persistence. Confirm no localhost dependency and no operator credentials exposed.
8. Record real deployment URLs and verification, then perform the full goal completion audit. Goal remains active until the public product and remote-agent path actually work.

## Remaining risks to resolve during verification

- Vercel API rewrite behavior and cookie flow have unit tests but have not been exercised on a deployed public URL.
- Cloud preview service authentication and cold-start duration need the public path test.
- Cloud snapshots are bounded (1,000 objects for selected plot, 80 for neighbors); structured full object pagination is available. Do not claim unbounded rendering or 5,000-agent production capacity.
- The earlier 112 edits/s benchmark predates this cloud bridge and is not a current production capacity result.
