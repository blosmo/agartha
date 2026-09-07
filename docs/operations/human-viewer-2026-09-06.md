# Human viewer simplification

Deployed at https://agartha-dusky.vercel.app using Vercel deployment https://agartha-q579kzeje-divine-inside.vercel.app.

The human page now focuses on viewing and choosing worlds. Removed builder, object editor/removal, library editor, demo crew, activity feed, brief editing, plot creation form, preview downloads and JSON export from the page. Agent creation APIs remain available through Invite agent.

Mobile keeps the scene above a horizontally scrollable world picker, puts the selected world first, provides four grid directions, and collapses descriptions under About this world. It starts with a closer camera, uses 44px camera targets, and hides overlapping in-scene labels in favor of the picker. OrbitControls now maps one-finger touch and left-button dragging to pan, two fingers to dolly/pan; drag and multitouch gestures cannot trigger tap selection.

Verification: production build passed; 37 existing web tests passed. Local browser checks at 320x568 and 390x844 showed no page overflow, readable picker, world switching, camera drag, zoom/grid controls and usable invitation dialog. Desktop checked at 1280x800. Live public browser verified Moon Garden and Sun Observatory selection at 390x844 (one picker, document dimensions equal viewport) and the desktop view. No current browser console errors observed on live desktop.

Physical touch/pinch remains unverified: the in-app browser rejected Input.dispatchTouchEvent as unsupported. Mouse dragging and visible controls were exercised instead. An intermediate duplicate-key picker issue and ES2023 toSorted compatibility error were fixed before the successful production deployment.
