# Agartha interface review and fixes

## Scope and Coverage

Full mode across the reachable browser interface: the shared 3D world, camera and walking controls, Rooms, Watch, Inspect, invitation dialog, hosted Rules and proposal forms, plus the legacy canvas in Human and Agent modes, its tool/material controls, terrain/time controls, stamps, and material dialog.

Stack: React 19, Vite, Three.js, Pixi, Phosphor icons, and plain CSS with existing hex/RGB tokens. Conventions inspected: CONTRIBUTING.md and the previous docs/reviews/2026-09-06-interface-review.md. No AGENTS.md, CLAUDE.md, CODING_STANDARDS.md, or dedicated design-system file was found. The earlier review describes several building/editing panels that are no longer mounted by WorldSpace; those dormant components and the unmounted replay UI are outside this review. Billing/provider infrastructure is outside the browser-interface scope.

All six owning skills were applied. Desktop (1440×900), narrow (320×640), and a 720×450 layout viewport equivalent to 200% zoom on the desktop were inspected. Native browser zoom, VoiceOver, and native iOS behavior are not claimed. Hosted governance was rendered from the actual component using isolated local response fixtures; no hosted proposals, votes, accounts, or world data were changed.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Keyboard focus and return, native dialogs, radio groups, canvas region selection, animation pause/reduced motion, labels and landmarks | 6 consolidated findings fixed |
| Layout | Header bounds, scrolling panels, canvas framing, mobile dialogs, zoom-equivalent layout | 2 findings fixed |
| Writing | Invitation feedback, connection/loading/error/empty states, object search, material dialog | 2 findings fixed |
| Typography | Computed input sizes, small labels, wrapping, changing counters, dialog measure | 1 finding fixed |
| Colors | Computed chrome pairs, screenshot background sample for zoom, focus-ring backing | 1 finding fixed |
| UI | Hover/focus/pressed states, icon consistency, surface hierarchy, decorative motion | Clear after fixes owned by the domains above; existing visual language retained |

## Findings

All twelve findings below are implemented. Locations identify the resulting source; the Before column records the reviewed behavior.

| # | Severity | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | HIGH | Layout | apps/web/src/worlds/worldSpace.css:82 | At 320px, Invite agent extended from x=317 to x=351, outside the viewport | Two-row mobile header; explicit space between header, scrollable panels, and camera controls; sticky panel headings | The primary onboarding action was unreachable |
| 2 | HIGH | Accessibility | apps/web/src/controls/radioGroupKeyboard.ts:3; apps/web/src/board/BoardCanvas.tsx:181 | Radio-style buttons all occupied Tab order without arrow navigation; rectangular canvas selection depended on dragging | One Tab stop per radio group, arrows/Home/End; Shift+arrows extend a region, Enter applies line/shape or retains marquee selection; nested camera buttons no longer trigger painting | Keyboard users could not perform equivalent editing tasks |
| 3 | HIGH | Accessibility | apps/web/src/controls/MaterialEditorPanel.tsx:400 | Custom material modal declared aria-modal but did not make the background inert | Native dialog, initial input focus, native containment, Escape, and focus return | Background content remained exposed during a modal task |
| 4 | HIGH | Accessibility | apps/web/src/app/layout.css:1723 | Command input explicitly used outline:0 | Shared visible focus rules, including command input and select controls | Keyboard position was invisible in a core input |
| 5 | HIGH | Accessibility | apps/web/src/worlds/WorldViewport.tsx:276; apps/web/src/controls/MaterialEditorPanel.tsx:130; apps/web/src/controls/AgentCommandPanel.tsx:70 | Scene animation autoplayed without a pause action; decorative dock borders animated continuously | Explicit scene pause/play; preference-driven pause remains authoritative; decorative border animation removed | Users need control over persistent motion |
| 6 | HIGH | Colors | apps/web/src/worlds/worldSpace.css:5,100 | Zoom text was drawn over the scene at 3.09:1 in the sampled frame; focus outlines crossed unpredictable scene colors | Opaque zoom background gives 13.84:1; dark backing around the gold focus outline gives 12.50:1 | Normal text requires 4.5:1; focus must remain visible over bright content |
| 7 | HIGH | Accessibility | apps/web/src/app/App.tsx:931,1051; apps/web/src/worlds/governance/GovernancePanel.tsx | Resetting or changing terrain erased undo history; proposal withdrawal had no confirmation | Cell replacement enters the existing undo history; withdrawal asks for confirmation | Accidental activation could discard work or irreversibly withdraw a proposal |
| 8 | MEDIUM | Accessibility | apps/web/src/worlds/usePanelFocus.ts:4; apps/web/src/worlds/WorldSpace.tsx:29 | Panels opened without moving focus and lacked Escape/return behavior; document navigation began with the canvas controls | Panel focus, Escape and logical trigger restoration; page heading and skip link; header precedes the scene in reading order | Opening a panel now moves keyboard users to its content and closing it returns them to navigation |
| 9 | MEDIUM | Accessibility | apps/web/src/controls/ObjectLibraryPanel.tsx:43; apps/web/src/controls/AgentCommandPanel.tsx:78 | Stamp name and command input relied on accessible names without persistent visible labels | Visible associated labels | Input purpose remains apparent while typing |
| 10 | MEDIUM | Layout | apps/web/src/board/BoardCanvas.tsx:139 | Fixed camera offsets could put the initial selected cells outside the viewport | Initial/reset view centers the selection; resizing preserves camera center; keyboard movement keeps the selected cell visible | The narrow editor could open on apparently blank space |
| 11 | MEDIUM | Typography | apps/web/src/worlds/worldSpace.css:1,75; apps/web/src/app/layout.css:1736 | 10–11px metadata and 12–14px mobile form inputs; changing values lacked consistent tabular figures | Minimum 12px metadata, 14px base world controls, 16px mobile text inputs, tabular counters and wrapping rules | Improves small-screen reading and avoids the sub-16px iOS input trigger; native iOS testing remains outstanding |
| 12 | MEDIUM | Writing | apps/web/src/worlds/AgentConnectDialog.tsx:46; apps/web/src/worlds/RoomInspection.tsx:35; apps/web/src/worlds/AgentActivityPanel.tsx:14; apps/web/src/worlds/governance/GovernancePanel.tsx:140; apps/web/src/controls/MaterialEditorPanel.tsx | Clipboard fallback pointed below instead of above; failures looked like ongoing loading; empty object search had no exit; material instructions described storage internals | Accurate copy feedback, reconnect/retry guidance, honest loading/error distinction, Clear search, and plain material instructions | Users can understand state and recover without guessing |

## Considered but Rejected

| Location | Candidate | Rejected because |
| --- | --- | --- |
| worldSpace.css / layout.css | Replace the palette or convert every token to OKLCH | Existing hex/RGB conventions work; only the verified contrast failure needed color treatment |
| AgentConnectDialog.tsx | Replace the invitation modal with a new library | Its native dialog already provides modality and focus containment |
| WorldSpace.tsx | Make every side panel modal | These panels intentionally coexist with the scene and camera controls; focus/Escape support solves navigation without blocking exploration |
| WorldViewport.tsx | Add animations or press scaling throughout the camera toolbar | Camera controls are frequent interactions; static state cues preserve the existing restrained behavior |
| Unmounted BuilderPanel, LibraryPanel, ReplayControls | Rebuild these as part of the whole-site pass | They are not reachable from either current entry point; adding them would change product scope |

## Verification

Passed:

- `npm test`: protocol 113, CLI 12, web 106 tests passed. Local server tests initially hit sandbox `listen EPERM`; `npm run test:scripts` with local binding allowed passed all 98. Remaining suites run explicitly: `npm run test:convex` 138, `npm run test:renderer` 20, `npm run test:release` 5. Total: **492 JavaScript/TypeScript tests passed** across these runs.
- `cargo test --workspace --locked`: **41 tests passed**, plus zero-test/doc-test targets.
- `npm run build`, followed by a final `npm --workspace apps/web run build`: passed. Vite retains its existing large-chunk warning.
- Final `npm --workspace apps/web test`: **32 files / 106 tests passed**. Added regressions cover panel focus restoration, roving radio navigation, keyboard regions, reversible terrain replacement, and nested camera-button key handling. Existing object-search test now covers clearing an empty search.
- `git diff --check`: passed.
- Browser: at 320px all header actions fit inside x=8…312; room panels fit between header and camera controls and scroll internally. Native invitation and material dialogs fit and remain modal. Escape returns to the opener; the material dialog starts in the name field.
- Browser: Pencil + ArrowRight focuses and selects Brush. Shift+Right, Shift+Down on the canvas creates a 2×2 selection. Command input focus computes to a solid 2px outline.
- Browser: animation pause produced two identical successive PNG hashes. Reduced-motion emulation exposed a disabled, pressed “Animation paused by reduced-motion preference” control.
- Browser: blocked plot requests show “Connection interrupted · retrying every 5 seconds”; network interception was removed afterward. Empty room and Watch states show invitation guidance. Forced WebGL failure gives recovery instructions while Rooms remains usable.
- Browser fixtures: actual Rules forms, proposal detail, empty/loading/error variants inspected; errors show Refresh rules rather than indefinite loading. Proposal details and forms reflow at 320×640 and 720×450.
- Contrast: zoom text 3.09:1 → 13.84:1; gold/dark focus pair 12.50:1. Conservative alpha composition over white for sampled world panels passed, minimum 6.86:1. Sampled legacy text passed, minimum 5.28:1. These are measured samples, not whole-product contrast certification.
- Release candidate check: run against a temporary Git index containing the reviewed working tree; the real index remains unchanged.

Not verified:

- Native 200% browser zoom, actual VoiceOver output, forced-colors mode, and native iOS input behavior. The 720×450 layout check is explicitly a zoom equivalent.
- Real hosted writes, paid providers, or deployed production behavior. Changes remain local.
- APCA and exhaustive contrast measurements for arbitrary user-generated scenes. Chrome now supplies an opaque backing for the identified scene-dependent text pair.

## Verdict

No identified actionable interface findings remain in the verified scope above.

Approve


## Browser feedback follow-up

The user requested removing the scene pause action; it has been removed, with OS reduced-motion handling retained. The pause-control recommendation above is superseded by this explicit preference. The compass row was also removed; named rooms and coordinate navigation remain. Room selection now keeps the info overlay closed instead of briefly opening it before camera movement closes it; Inspect is the explicit entry point. The local Rules message now explains the separate local data and links to the online world. Two regression tests cover scene and list selection without an overlay.
