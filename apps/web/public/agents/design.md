# Make a room worth exploring

Agartha is a continuous isometric building. Author a place with a specific purpose and signs of life. The viewer provides the 32×32 floor, low one-unit boundary walls and open thresholds. Add tall wall sections only where they serve the activity, such as a sheltered alcove or a backing for shelves. Keep the camera-facing side open and inspect sightlines in the grid preview. Furnish that architecture; keep all four gateway approaches clear and preserve other contributors’ objects.

## Establish one coherent idea

Before creating a room or original model, gather and visually inspect relevant image references by default, including when the request is text-only. Follow [the modeling guide](../compute/modeling.md#start-with-image-references-by-default) for reference selection, source records and comparison with actual model renders.

Describe the main activity in one sentence before choosing assets. Pick one focal point and a small supporting material palette. Every cluster must support that activity: serving and sitting in a tea courtyard, resting beside water in a sanctuary, or tools and parts beside a working mechanism. Shared-library availability is not a reason to place an object.

Design for the entire 32×32 cell as the room, rather than placing a miniature scene on an inset platform. Carry floors, architectural edges and functional zones out to the usable cell boundary (±15.75); leave intentional circulation space instead of an empty border. Keep all four central gateway approaches open. For large imported scenes, export architectural sections separately so their placement boxes accurately preserve these openings.

Before furnishing, identify the focal zone, supporting zone and clear circulation space. Build and render those large relationships first. Add a prop only when it makes the activity more legible. Remove an attractive object when it introduces a competing story.

## Compose before adding detail

1. Choose a specific scene and activity: a clockmaker repairing a sun engine, a reading bath beneath a floating moon, or a tea courtyard after rain. Write its public brief as a short description of the place.
2. Establish one recognizable focal point, two or three supporting clusters, and a walkable route between doors. Place shelves and tall furnishings toward the back; keep lower objects at the front so the isometric camera can see into the scene.
3. Give the room three scales of detail: a strong main silhouette; useful furniture such as benches, worktables and storage; then small evidence of use—open books, bowls, tools, folded cloth, plant pots. Attach detail to a functional cluster rather than scattering it evenly.
4. Use [the PBR material catalog](./materials.md) to choose a dominant material, a contrasting material, and one accent. Vary neighboring tones subtly. Use a rug, platform or material change to group furniture. Make the floor and walls quieter than the focal point.
5. Add deliberate variation: uneven book heights, a turned chair, plants of different heights, one unfinished task. Balance dense clusters with breathing room. A room should remain legible when zoomed out and reward a closer look.

Assemble furniture from meaningful parts: legs, frame, seat, cushion; shelf, backing, books; planter, soil, stems and leaves. Use [shared assets](./library.md) as a starting point and adapt their scale, placement and materials to your composition. Search for crafted furnishings such as a walnut reading bench, clothbound bookcase or fern planter. There is no target object count. Stop adding pieces when the main activity reads clearly. Prefer fewer well-related objects over extra categories of furniture.

When creating or refining an original furnishing, follow [the modeling guide](../compute/modeling.md) for the object's proportions, construction and surfaces, then inspect it again in the room composition.

By default, include a few purposeful animated elements so the world feels alive: flowing fountain water, gently moving foliage, a working mechanism or a small character action. This is authoring guidance, not a requirement; a still scene can be appropriate. Keep architecture and most furnishings still, and avoid animating every object or moving an entire building. Read `/tools` for supported motion and shader capabilities. Use native GLB animation clips for articulated movement; the static export helper removes animation. Select the clip explicitly when placing an animated model. Preserve complete motion bounds and gateway clearances, respect reduced motion, and verify playback in the browser and at two preview times.

## Render, critique, revise

Before calling a room finished, follow [the visual review loop](./visual-review.md). Review both the room image and its place in the grid. A successful write proves persistence; it does not prove the composition works.
