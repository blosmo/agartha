# Continuous first-person walkthrough

First-person movement crosses room boundaries without resetting the camera or leaving walkthrough mode. Walking samples the current world address and prefetches ahead through the existing bounded neighborhood loader. Explicit room focus and exiting walkthrough restore the overhead camera at the selected room. The existing world coordinate boundary remains enforced.

Walls and visible scene objects receive automatic collision checks against their rendered geometry, including instanced primitives and imported model meshes. Short horizontal body probes at three heights prevent walking through obstacles; separate axis resolution lets movement slide along walls. Doorway openings remain open. This is ground-level walking, without gravity, jumping, stair climbing, or a rigid-body simulation.

Lighting uses warmer directional sunlight with cooler sky fill and stronger environment lighting. Shadows follow the active camera target: a tighter 56-unit region in first person improves nearby detail while the overview retains a broader region. Reduced depth bias and normal bias improve contact shadows, with the same 2048 shadow map and existing model budgets.

Verification: 11 focused camera, collision and streaming tests pass; complete production build and diff checks pass. Local browser crossed the Commons boundary to plot-0-1 while remaining in first person at z=20.7, then stopped at the west wall at x=-15.42. Frame time was approximately 8.34 ms in these checks. Imported-group transforms, instancing, thin walls, doorway openings and wall sliding are covered by tests.
