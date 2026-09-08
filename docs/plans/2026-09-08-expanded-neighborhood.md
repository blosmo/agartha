# Expanded neighborhood

Show a 5×5 neighborhood (25 rooms) in the browser with wider default framing. The public API accepts radius=2 while its existing default remains radius=1 (nine rooms). Validate the radius before enumerating cells and retain coordinate boundaries.

Prioritize imported models by distance from the selected room. Preserve the renderer's 32 MB source, 16.8M texture-pixel, 200K triangle and 192-draw main-pass limits. The active room receives up to 1,000 objects, adjacent rooms 200, and the outer ring 64. Moving the view or entering a room restores that room's central detail budget. No rooms are created by browsing.

Poll every five seconds and pause requests while the page is hidden. Cache at most four neighborhoods. Keep local and cloud radius behavior consistent; unchanged API calls and previews retain the nine-cell contract.

Verification covers 25 cells, radius rejection, boundary clipping, distant snapshots regaining detail, local HTTP behavior, browser framing, live model resource usage and frame-time measurements on the same desktop viewport.
