# Floating model carousel

The Compute landing page surrounds its headline with five Platonic solids, a mint bunny, and a lavender whale. The collection moves along a slow rainbow arc with softly masked edges. Pointer hover adds an eased lift and tilt without tooltips; scrolling adds subtle parallax and rotation. Both effects respect reduced motion. Model buttons support selection, horizontal drag rotation, and arrow-key navigation. The eyebrow, supporting note, carousel toolbar, and idea/download row were removed after visual review.

The controller loads Three.js separately from the page. WebGPURenderer uses WebGPU with WebGL2 fallback. Transparent Blender posters remain visible if graphics initialization fails. Reduced-motion preferences start the collection paused; document visibility and intersection pause animation work. HTML controls remain separate from the canvas.

## Regenerate the original assets

With Blender 4.5:

```sh
blender -b --factory-startup --python-exit-code 1 \
  --python scripts/blender/create_carousel_models.py -- \
  apps/web/public/compute/models
```

The generator verifies each solid's polygon count before beveling. It exports untextured PBR GLBs and transparent rendered PNGs, with provenance and byte counts in `models/provenance.json`. No external assets or paid generation services are involved.

## Verification, September 9, 2026

- Web build and TypeScript check passed.
- Existing `scripts/computePage.test.ts`: 19 tests passed.
- Local production-build browser checks cover WebGPU on Metal, WebGL2 with WebGPU unavailable, and poster fallback with both graphics APIs unavailable.
- Browser checks also verify hover lift, return to rest, tooltip removal, and scroll parallax.
- Browser checks exercise reduced-motion stability, previous/next and keyboard navigation, play/pause, brief prefill, preservation of a disabled active-job brief, GLB download magic bytes, and absence of POST requests.
- Layout checks cover 1280, 768, 390, and 320 pixels without horizontal overflow. Desktop and mobile renders were visually inspected.

This report describes local verification. It does not establish deployment to the public site.

The later minimal-hero revision was checked for all four removed elements, successful GPU rendering, and mobile overflow. Earlier toolbar and prefill checks above describe the prior revision.
