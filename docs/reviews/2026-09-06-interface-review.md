# Agartha full interface review

## Scope and Coverage

Full mode, all reachable product interfaces: shared 3D workspace, brief editor, object list/inspector, activity, export control, agent invitation; legacy canvas in Human and Agent modes, tool dock, material dialog, terrain/time controls, stamp library, collaboration and deployment panels. React 19, Three.js and Pixi, Phosphor icons, plain CSS with existing hex/RGB tokens. No AGENTS.md, CLAUDE.md, CONTRIBUTING.md, CODING_STANDARDS.md or dedicated design-system guidance found in the repository. Product context: README.md, STRATEGY.md, docs/protocol/shared-world-api.md, and docs/superpowers/plans/2026-09-06-shared-worlds.md.

All six better-interface owner skills were read and applied. This is a read-only source review with browser inspection; only this report was added. Neither scene nor hosted canvas data was edited. The unmounted ReplayControls component was inspected in source but is not a reachable product surface.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Both viewports, keyboard handlers, accessible trees, both dialogs, object actions, reduced-motion emulation, live-region markup | 4 findings |
| Layout | Desktop and 320px renders, DOM bounds, pane overflow, contributor list | 2 findings |
| Writing | Invitation, brief editing, offline/reconnect behavior, empty collaboration/stamps, material copy | 3 findings |
| Typography | Computed 8–12px UI text, headings, body measure, input styles, narrow rendering | 1 finding |
| Colors | Eight computed foreground/background pairs in the 3D workspace; legacy styles and rendered dark appearance | Clear in measured pairs; no exhaustive contrast-conformance claim |
| UI | Button states, icon consistency, panel hierarchy, native modal, legacy modal, focus/hover rules | Clear; issues owned by other domains are not repeated |

## Findings

| # | Severity | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | HIGH | Layout | apps/web/src/app/layout.css:157, :486, :1655 | Legacy app uses `height:100vh; overflow:hidden`; dock is 682px wide; mobile merely switches to one column | Give mobile panes reachable document flow or explicit pane navigation; wrap or scroll the dock inside the viewport | At 320×720, dock bounds are x=-181…501 and the sidebar occupies y=720…1440 behind the 720px clipping parent. Core editing controls are unreachable. |
| 2 | HIGH | Accessibility | apps/web/src/worlds/WorldSpace.tsx:99 | `Remove object` immediately submits `remove:[object.id]`; no undo or confirmation | Add confirmation naming the object and author, or reliable undo with explicit destructive treatment | One accidental activation permanently changes shared work, including another agent's objects or the island foundation. No destructive action was executed during review. |
| 3 | HIGH | Accessibility | apps/web/src/app/layout.css:93, :486 | Legacy dock runs `24s linear infinite gradient-border` | Gate decorative animation behind `prefers-reduced-motion:no-preference` | With reduced motion emulated and confirmed true, computed dock animation still runs. The new workspace's scoped reduced-motion CSS does not cover the legacy app. |
| 4 | HIGH | Accessibility | apps/web/src/worlds/WorldViewport.tsx:30; apps/web/src/worlds/WorldSpace.tsx:97 | OrbitControls offers pointer zoom; UI offers only Reset camera | Add named Zoom in/out buttons and keyboard shortcuts; describe all camera controls | Keyboard users can pan/rotate with OrbitControls but cannot change viewing distance. Installed OrbitControls key handler only covers arrow keys; no zoom handler is supplied by the app. The legacy canvas already provides keyboard zoom. |
| 5 | MEDIUM | Writing | apps/web/src/worlds/WorldSpace.tsx:47, :49, :95, :114 | Disconnected state says `Connecting`; error says `Failed to fetch`; the same alert remains after success | Distinguish connecting/offline/recovered; clear connection errors on successful refresh and give an actionable offline message | Offline/reconnect browser check produced `Shared locally` and an obsolete failure alert simultaneously. Users cannot tell whether intervention is still needed. |
| 6 | MEDIUM | Writing | apps/web/src/worlds/WorldSpace.tsx:36, :103, :104 | Brief form keeps the revision captured when opened, but gives no reconciliation action after a conflict | Preserve the draft, show the latest brief alongside it, and offer an explicit reapply/merge action against the current revision | A concurrent contribution leaves repeated Save attempts tied to the same stale revision. Recovery currently requires cancel/reopen and manually preserving draft text. Confirmed by source; concurrent browser editing was not induced against shared data. |
| 7 | MEDIUM | Typography | apps/web/src/worlds/worldSpace.css:1, :27 | Connection text is 8px on mobile; contribution status 9px; history 10px; crew descriptions and prompt 11px | Define a small semantic scale; raise functional text toward 12–14px and editable mobile inputs to 16px | Important status and activity are harder to read than the generous scene layout warrants. Measured sizes, not a contrast failure. Native iOS input zoom was not tested. |
| 8 | MEDIUM | Layout | apps/web/src/worlds/WorldSpace.tsx:84, :107, :108 | Scene says four contributors, but `Build crew 03` always lists only three scripted agents | Show actual contributors separately from the demo crew, with the invited agent visible after its first edit | Live scene has Reed plus Terra, Arch and Weave; Reed appears only in history/object attribution. This weakens onboarding's visible completion signal. Do not label historical contributors as online. |
| 9 | MEDIUM | Accessibility | apps/web/src/worlds/WorldSpace.tsx:95, :98, :108, :110 | Revision, build completion and activity update outside a live region | Add one stable polite status region for meaningful completion/new-contribution events | Screen-reader users get urgent errors but no reliable announcement that an agent finished or changed the world. Avoid announcing every polling tick. Source/AX evidence; actual VoiceOver was not run. |
| 10 | LOW | Writing | apps/web/src/controls/MaterialEditorPanel.tsx:607 | `Define the material once. Cells only store material id and variant.` | `Choose a color and adjust how the material behaves.` | Storage details do not help a person create a material. Confirmed in the rendered New Material dialog. |

## Considered but Rejected

| Location | Candidate | Rejected because |
| --- | --- | --- |
| apps/web/src/worlds/worldSpace.css:1 | Convert the palette to OKLCH | Existing hex/RGB notation is consistent; sampled text contrast passes. A notation migration would not fix these problems. |
| apps/web/src/worlds/AgentConnectDialog.tsx:33 | Replace the native dialog with a modal library | Accessible name, keyboard focus containment, Escape and return to trigger are present. No extra library is needed. |
| apps/web/src/worlds/AgentConnectDialog.tsx:45 | Remove the localhost limitation from onboarding | It accurately describes the current transport boundary and prevents a misleading promise to cloud-agent users. |
| apps/web/src/app/App.tsx:1581 | Treat Stop agents as an immediate kill switch | Copy explicitly says stopping happens after the current action, and the loop checks the stop flag. Server-side cancellation was not promised. |
| apps/web/src/replay/ReplayControls.tsx:3 | Report placeholder replay behavior as a product blocker | Component is not mounted anywhere; it is not a current reachable interface. |

## Verification

Passed checks:

- `npm --workspace apps/web test`: 10 files, 35 tests passed in this review. These test results do not prove visual/accessibility readiness.
- Shared workspace: current revision 5, 43 objects and four contributors verified through the accessibility tree. Main viewport fits 320px with document scrollWidth=320.
- Invitation: inspected at desktop and 320×720; prompt, copy action, close control and local-only explanation are present. Tab cycles inside dialog; Escape restores the trigger. Copy success/failure tests pass.
- Legacy: Human/Agent modes, loaded Convex snapshot, empty stamps/collaboration, material dialog focus/restore, terrain/time/deployment controls inspected without running mutations.
- Legacy narrow layout: measured clipped toolbar and offscreen sidebar bounds as quoted in finding 1.
- Reduced motion: CDP `Emulation.setEmulatedMedia` with reduce; `matchMedia` true while dock animation remains active. Reset after inspection.
- Network: CDP offline emulation produced disabled build and `Failed to fetch`; online restoration restored `Shared locally` but left the error. All emulation reset afterward; original workspace reloaded.
- WCAG 2 text ratios from computed styles: brief 9.97:1; crew description 7.60:1; contribution state 9.77:1; activity 7.46:1; crew label 7.62:1; crew footnote 6.28:1; connection 8.59:1; primary action 9.63:1. Each exceeds 4.5:1. These are sampled opaque pairs, not an APCA or whole-product certification.

Not verified:

- Native 200% browser zoom: shortcut attempts did not establish a reliable zoom factor; 320px reflow was independently verified and already revealed a blocker.
- Actual screen-reader output, forced colors, native iOS focus zoom, every legacy translucent contrast pair, and APCA measurements.
- A completely empty 3D world and forced WebGL failure: source paths inspected, not induced by deleting current work or changing renderer initialization.
- Provider write/error paths, export download contents, and real autonomous-agent behavior were not exercised during this read-only review. Prior implementation testing is not counted as new review evidence.

## Verdict

Block

## Blocker remediation — 2026-09-06

Findings 1–4 are fixed and rechecked. The medium/low findings above remain outside this blocker-only patch.

- Mobile legacy layout: at 320px, toolbar bounds are now x=12…308 (296px wide). Document scroll height is 1,841px; sidebar starts at y=540 and is reachable by page scrolling. No horizontal overflow.
- Removal: native confirmation names the object and author, initially focuses Keep object, and pins the observed revision so newer work cannot be silently removed. Cancel closes and restores focus. Browser cancel left revision 5 and all 43 objects unchanged. Tests cover no mutation before confirmation and visible failure feedback inside the modal.
- Reduced motion: with the preference active, legacy dock computed animation is `none`. The 3D camera also disables damping under reduced motion and responds to preference changes.
- Zoom: named zoom buttons and canvas +/=, -, and 0 keys added. Browser verified 100% → 125% → 100% and reset; controls expose the zoom level.

Post-fix verdict for the four blockers: resolved. The broader review still needs changes for its remaining medium/low findings.
