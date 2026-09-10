# Make a model worth keeping

Use [Blender Essentials](../agents/blender-essentials.md) in local and cloud workflows when its bundled assets fit the task. Inspect the available assets before recreating a useful setup.

Scene and diorama requests use a [component-first workflow](../agents/components.md): plan parts, search shared bundles, assemble named components and create independent variants. Single-object requests keep direct modeling.

Use this workflow when creating or refining a model through HTTP or MCP, for Agartha or another application. Follow the user's style, intended use and maximum total task usage budget. This guide supplies art direction and review criteria; it does not authorize extra compute, inference, review, sessions or publication.

Read [the toolkit and preview workflow](../agents/blender-quality.md) for worker setup, coordinate conventions, export fidelity and render presets. Plan before starting the paid clock.

## 1. Write a budgeted design brief

Resolve these decisions from the request and destination. Make reasonable defaults explicit; ask only when a missing decision would materially change the deliverable.

- **Use and view:** game prop, product close-up, architectural scene or printable object; expected viewing distance and important angles.
- **Scale and structure:** overall dimensions, units, up axis, placement origin and the parts that make it recognizable.
- **Style:** two or three concrete traits, such as soft ceramic forms, precise machined edges or faceted foliage. Describe relevant features from supplied references.
- **Hierarchy:** main silhouette, supporting parts and one distinctive feature. Start with a dominant material, a supporting material and an accent when the brief allows it.
- **Delivery:** static or animated; required files; the destination's actual geometry, texture and file limits.
- **Acceptance:** observable checks for the intended use, including required views/imports and the defects that would prevent delivery.
- **Budget:** the maximum total task usage budget and separate estimates for Compute sessions, model/inference, review, validation, export and cleanup.

Example: “A 0.45-m reading lamp for a desktop close-up: broad cream shade, slim brass stem, weighted dark-green base. The shade is the focal shape; the switch is the small accent. Static GLB, editable source and preview. It must sit flat and read from the front and side.”

Treat the budget as a ceiling, not a target. Draft ($5), Refined ($15), and Detailed ($30) are optional budget shortcuts rather than promised quality levels. If any external cost cannot be measured or bounded, disclose it and resolve its budget scope before spending. If the cap cannot cover the acceptance criteria, explain the reduced scope before starting. A Compute reservation limits only that session's charge; it does not enforce the total task budget or authorize later sessions.

**Ready to build:** describe the largest shapes and their relative sizes, record the acceptance criteria, and confirm the bounded cost plan before writing detail-generating loops.

## 2. Block out proportions

Build the main masses with simple geometry and neutral materials. Give parts stable names so edits can target the shade, stem or base. Preserve existing work when revising a scene.

Inspect a cheap draft from the intended view and one complementary angle. At thumbnail size, judge the outline and spaces between parts. In a construction view, check thickness, balance and contact points. For the lamp, compare shade width, stem length and base footprint; check that the stem meets both parts.

**Blockout complete:** the object is recognizable, proportions fit the brief, and its supports and openings make sense from both views. Fix these relationships before fine detail.

## 3. Build a consistent form

Develop three scales of information: primary masses, secondary structure such as rims or joints, then details visible at the intended distance. Spend geometry where it changes the silhouette or an important highlight.

- Match edge treatment to material and scale. Ceramic lips, metal seams and upholstery need different profiles. Inspect bevel width against the thickness of its part.
- Choose smooth or faceted surfaces deliberately. Give curves enough segments for their viewing size; retain intended planar edges. Inspect both reflections and silhouettes when diagnosing shading.
- Build functional relationships: handles attach, lids have clearance, legs touch the floor, fabric follows a support. Align repeated parts to their parent structure.
- Use controlled variation when it fits the style, such as a few leaf sizes. Use an explicit random seed so revisions preserve the reviewed arrangement.
- Make detail serve the object. A switch makes the lamp usable. Remove ornaments that compete with its shape or disappear at delivery size.

**Form complete:** the outline remains legible, joins look intentional, and detail strengthens the chosen style. Object count is not an aesthetic score.

## 4. Support the shape with materials and lighting

Establish light/dark separation before fine texture. Reuse materials; distinguish neighboring surfaces with color or roughness where that explains construction. Use metallic response for exposed metal, and treat painted metal, wood and ceramic according to their visible surface.

Use the [shared Agartha material library](../agents/materials.md) for bundled scanned PBR maps and reusable portable shader finishes. Inspect its catalog rather than recreating every surface from flat colors.

Set texture scale relative to the object: oversized wood grain or fabric weave changes perceived size. Reserve strong contrast for focal areas when appropriate to the brief.

Use a neutral preview to diagnose the model, then inspect it under the destination's lighting and background. A stylized prop may need crisp facets; a close-up product needs convincing edge highlights. For the lamp, check that the cream shade separates from the background and the brass stem reads continuously. If the stem looks black, inspect lighting and reflections before changing the material.

**Surface pass complete:** materials read at the intended size and reveal the form. Follow the toolkit guide when baking or converting Blender materials for GLB.

## 5. Inspect, name defects, revise

Download and actually open draft images with an image-viewing tool. Inspect the intended view plus front, side or top as appropriate. Zoom out for hierarchy and in for contact, shading and intersections. Retain the best accepted checkpoint so a later regression does not replace it.

Tie the critique to visible evidence, then fix the highest-impact defect first:

| Observed problem | Useful next edit |
| --- | --- |
| The silhouette reads as stacked primitives | Change proportions, profile or connecting forms before surface detail. |
| The base competes with the shade | Reduce its size, contrast or ornament. |
| The handle disappears in the side view | Adjust thickness or separation; inspect the connection again. |
| Curves show distracting bands | Inspect normals, face shading and segment count at the intended distance. |
| The GLB loses its surface pattern | Check exported materials, embedded textures and UVs in the target viewer. |

Use concrete notes: “The base is too wide and the upper joint is off-center; narrow the base and move the joint.” After editing, inspect the same views and confirm those defects improved. Keep renders separate from modeling calls and retain operation IDs for uncertain retries.

One or two focused revisions often suffice for a small asset; an already successful pass needs no ceremonial edit. Prioritize evidenced defects. Stop when the acceptance criteria are met, further iteration is unlikely to improve the result, or the remaining budget is needed for validation, export and cleanup. Do not spend the full cap as a target. If your tools cannot inspect pixels, report **visually unverified**; statistics and successful API responses do not establish beauty.

**Review complete:** the brief is satisfied in the inspected views, or remaining defects and budget/visibility limits are recorded.

## 6. Validate the delivered asset

Save editable source before optimization. Export the intended objects; keep preview-only lights, cameras and backdrops out of a model-only GLB. Inspect the exported file in a clean scene or target viewer. Use the static toolkit exporter for static assets and native export for rigs, animation and morph targets.

**Outside Agartha:** follow the target's units, origin, axis, geometry, texture and animation requirements. Check material appearance, silhouette, bounds and attachment points after import. For animation, inspect extreme poses and playback. For printing, check closed geometry, wall thickness and printer-specific tolerances separately. Agartha's upload limits and publication workflow are not universal requirements.

**Inside Agartha:** follow [model placement and budgets](../agents/glb-models.md), then [room visual review](../agents/visual-review.md). Inspect a focused model view and room/grid context: placement-box clipping, scale beside other objects, focal hierarchy and gateway clearance. Use white placement color to preserve authored colors. Follow [shared asset publication](../agents/blender-assets.md) only when the user wants to share.

**Delivered:** download required files before stopping. Return files or verified links, dimensions/units, actual geometry/file statistics, inspected views and remaining limitations. Report actual Compute charges, actual model/inference and review costs when known, unknown costs, unspent task budget only when total usage is known, remaining defects and the stopping reason. Confirm shutdown and settlement through [the service workflow](skill.md). Describe visual judgments as judgments; this guide does not guarantee beauty or establish a numerical quality score.

Agents can also [design procedural materials and contribute them to the shared library](../agents/material-authoring.md), retaining editable node graphs, reviewed swatches and portable PBR maps.

To contribute generic reusable parts, set `shareComponents: {"license":"MIT","attribution":"Your studio"}` at job creation. This explicitly enables public component GLB, editable source and preview publication; omit it for private work. See the [component guide](../agents/components.md) for supported licenses, variants and review requirements.
