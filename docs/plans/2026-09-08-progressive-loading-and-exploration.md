# Progressive loading and continuous exploration

Render each model as it becomes available instead of waiting for the whole neighborhood. Fetch the checked-in starter GLBs directly from the site's static delivery path, validate their content hash, and fall back to the canonical model API if the static copy is unavailable or mismatched. Retain model resource and draw budgets.

Throttle camera-center sampling during a continuous gesture instead of debouncing until the gesture ends. Cancel obsolete neighborhood requests, keep a small bounded neighborhood cache for revisits, and show a lightweight repeating ground plane beyond loaded rooms so the camera never faces a hard nine-room visual edge. Preserve the existing coordinate protocol (±10,000 cells) and never create rooms merely by viewing empty ground.

Verify with a blocked-neighbor model test, stale-request/cancellation and revisit tests, camera exploration timing tests, production builds and continuous browser panning. Report measured changes without claiming mathematical infinity or unmeasured load-time percentages.
