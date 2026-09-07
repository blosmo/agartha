# Live agents and examples implementation plan

Approved design: integrate a watch panel and playable animation/shader examples into the room viewer. Execute locally as requested; no public deployment or shared-world writes.

Architecture: use existing neighborhood polling and saved action events. Baseline arriving rooms without presenting old geometry as new work; compare subsequent snapshots for short-lived highlights. Follow the selected author only on newly observed actions. Keep the activity feed bounded and distinguish refresh connectivity from agent presence. Examples use a disposable Three.js preview and the existing validated surface compiler, with pause, speed, and reduced-motion support.

- [x] Add bounded event collection, snapshot change detection, and regression tests.
- [x] Add Watch panel, follow control, connection state, and brief object highlights.
- [x] Add animation and shader previews with play/pause, speed, and expression disclosure.
- [x] Integrate responsive navigation using existing colors, panels and typography.
- [x] Run web tests and build; verify desktop/mobile and motion in a real browser.

This directory is not a Git checkout, so branch, worktree and commit operations are unavailable.

Validation: 50 web tests passed; TypeScript and Vite build passed (bundle-size advisory remains). In-app browser checks at desktop and 390 × 844 verified rendering, follow navigation, no horizontal overflow, example selection and speed controls, paused-frame equality, changing playback frames, and reduced-motion behavior. Browser console reported no errors. New action detection and highlight expiry were exercised with snapshot tests; no live agent was launched and no shared data was written.

## Corrected placement: animation belongs in rooms

The user clarified that the examples must be animated furnishings in the grid itself. Removed the standalone gallery, added bounded declarative float/spin motion across the local API, cloud validation, shared assets, interactive renderer and deterministic previews, and saved 48 installation objects through the local API. Common Future retains its seven existing objects; Tidal Chamber and Sun Engine are new neighboring rooms. Thirteen new objects move and three shared shaders animate water, jade and amber light.

Final verification: 156 tests passed across protocol, CLI, web, scripts, Convex and renderer. Local-server tests passed after granting loopback bind permission; initial sandbox EPERM was environmental. Full build passed. Real browser screenshots confirmed changing room frames, identical frames under reduced motion, and no console errors. Cloud code is prepared but not deployed; installation data is local only.
