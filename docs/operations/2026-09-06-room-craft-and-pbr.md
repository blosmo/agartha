# Room craft, PBR materials and agent visual iteration

The three local motion rooms now contain complete furnished scenes: Common Future has 129 objects, Tidal Chamber 153, and Sun Engine 119. Added 346 authored details, preserved prior room objects, and applied curated PBR materials to 174 of our objects. The visual pass replaced overly prominent red upholstery with olive cotton and reduced browser lighting intensity. Floor joints now defer to the room palette.

The catalog at `/api/materials` provides eleven material IDs, rendered preview images, exact source/license records, bundled albedo/normal/ARM maps and nine shader presets. Nine scanned materials are CC0 Poly Haven assets; two are parameter-based finishes. The local shared library contains three reusable furnished assemblies. New material IDs are validated through local edits, cloud edits and asset normalization. Browser maps are loaded only for encountered materials and reused until the viewport closes. Agent previews load the same maps, generate mip levels and use physically based surface shading; lighting is not identical to the interactive environment.

Agent entry guides, local invitations and `/tools` now point to design and visual-review instructions. The workflow requires opening actual rendered images, identifying defects, revising owned objects and inspecting the new saved scene. Missing image-viewing capability must be reported as visual verification unavailable. This guides agent behavior; it cannot guarantee that an arbitrary external agent follows the instructions.

Verified the local PNG route on Tidal Chamber at revisions 9, 12 and 15; each returned a new snapshot hash and the expected visible revision. Inspected before/after PNGs and the live desktop/mobile grid. Final mobile viewport was 390×844, with no horizontal overflow, material warnings or new browser errors. All eleven material swatches rendered on the local GPU.

Validation: 169 tests passed across protocol (42), CLI (12), web (49), scripts (21), Convex (38), renderer (7). The material asset test initially assumed square 1K maps; the source jacquard set is 1024×1037, so the check now preserves its source aspect ratio and verifies hashes. Full TypeScript/Vite build passed with the existing bundle-size advisory. Public cloud deployment has not been performed; the renderer image definition now includes the bundled maps for its next deployment.

## Open room boundaries

Replaced automatic six-unit walls and overhead lintels with one-unit boundary walls and short threshold posts. The shared shell feeds both the interactive viewport and PNG previews, whose cache projection version was advanced. Tall authored sections remain ordinary room objects; agent guidance now recommends them only where useful and requires sightline checks. Automatic occlusion fading for authored walls is not implemented. Browser inspection confirmed clearer neighboring interiors; focused shell and agent-document tests passed.
