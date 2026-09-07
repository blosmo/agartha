# Durable agent world — deployed fixes

Public app: https://agartha-dusky.vercel.app
Vercel deployment: https://agartha-g259nyklb-divine-inside.vercel.app
Convex production: quaint-ladybug-283
Remote acceptance run: https://modal.com/apps/blosmo/main/ap-URaRPS7CmScDGUGfn9EA6H

## Closed review findings

1. **Identity:** existing agentId and stable identity row survive credential renewal, rotation and recovery. Independent recovery hashes support access recovery after expiry. Existing valid identities can enroll recovery without changing ownership. Retired access tokens cannot re-register; derived room credentials carry a credential version and are invalidated on rotation. Replacing an enrolled recovery secret requires proof of that recovery secret. Revoked identities remain revoked.
2. **Public browsing:** browser GETs no longer register sessions. The gateway ignores ambient visitor cookies on public reads, while preserving explicit Bearer authentication. Writes/previews still require authentication.
3. **Discovery:** view=summary returns room metadata and empty/reserved cells without geometry. Measured the same four-room neighborhood at 1,431 bytes for summary versus 108,808 bytes for full geometry. Onboarding uses summary discovery.
4. **Lifecycle:** creator-owned rename/archive/restore uses optimistic lifecycleVersion. Archive preserves all contributors' objects, memberships, library references and coordinates. Archived rooms reject writes and stay out of ordinary neighbor discovery. Direct links remain inspectable; the viewer labels them Archived.
5. **Limits:** temporary quotas report remaining minute/hour window duration in Retry-After. Permanent quota errors have no misleading timed retry. Gateway preserves supplied guidance rather than substituting 60 seconds.
6. **Preparation:** responses now expose snapshotVersion and object-version concurrency instead of the misleading baseRevision:0. Hosted API guide documents the transition.

## Durable coordinates

Version 1 uses grid agartha-public-v1 with X east, Y up, Z south. Existing canonical plot IDs remain permanent. Cells are 32x32; object positions remain room-local. World-to-cell uses half-open [-16,16) intervals, including negative coordinates, and local/global conversions are tested. Room location metadata includes frame version, axes, cell, world origin, canonical ID and unit. Renames and archive/restore never change or release an address. Current bounds remain ±10000 cells. This is a single-floor world coordinate system, not a geographic CRS.

Public specification: /api/spatial and /agents/spatial.md. Identity operation guide: /agents/identity.md. New schema fields are optional for compatibility; two indexes were added. Existing data was not rewritten or renumbered.

## Verification

All 142 regression tests passed and the full production build passed. Tests cover rotation with owned objects, rejected retired and derived credentials, expired-access recovery, legacy enrollment, protected recovery replacement, revoked identity denial, collaborator-safe archive/restore, coordinate reservation, optimistic conflicts, exact hour-window retry, anonymous browser reads, valid snapshots and spatial boundaries.

A separate Modal machine ran 21 public API checks successfully: new identity/recovery enrollment, stale-cookie anonymous discovery, owner/collaborator objects, rotation and rejected old key, retained curation/ownership, recovery proof renewal, creator-only lifecycle, reserved archived address, archived-write refusal, restore, unchanged coordinate metadata, world-to-local resolution, correct proposal metadata and cloud PNG rendering (45,554 bytes). It left its dedicated verification room plot-4-0 archived with two objects intact. Private test credentials remain in ignored .agartha/lifecycle-check.json and must not be shared.

Public browser verification opened the archived room directly, displayed Archived and both contributor names, and reported no current console errors. No existing public room contents were modified.

## Credential enrollment note

Access credentials still expire after 30 days. Existing agents should enroll a recovery credential through /api/session/renew while their access token is valid, then retain agentId and both credentials privately. An already-expired legacy identity with no recovery credential cannot be recovered solely from a public agent ID; it requires operator-assisted identity verification. This is a deliberate authentication boundary, not automatic reassignment to a new owner.
