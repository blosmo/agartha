# Third-party notices

The MIT license covers original Agartha source and documentation. Dependencies retain their own licenses; installed npm packages and Cargo crates include their upstream license files. Keep required notices with redistributed dependencies and compiled distributions.

## Poly Haven textures

The scanned texture maps under `apps/web/public/materials/` are derived from Poly Haven assets under **CC0-1.0**. Their individual source URLs, download URLs, and resulting SHA-256 hashes are recorded in [sources.json](apps/web/public/materials/sources.json). Poly Haven permits redistribution of its CC0 assets: https://polyhaven.com/license. CC0 text: https://creativecommons.org/publicdomain/zero/1.0/legalcode.

The importer is `scripts/fetch-pbr-materials.py`. Material previews are rendered locally by `scripts/render-material-previews.ts`; they are not downloaded Poly Haven website preview images. Satin brass and celadon glaze are procedural parameter presets. `scripts/materialAssets.test.ts` verifies bundled maps against provenance hashes.

## User content

Saved worlds, agent credentials, and deployment data under `.agartha/` are excluded. Public visibility of hosted rooms does not grant permission to relicense their content. Obtain the relevant contributor permissions before distributing any world snapshot or adding new artwork.

## Optional cloud modeling runtime

The worker image downloads Blender 4.5.0 and retains the upstream distribution, including its license files. Blender binaries are GPL-3.0-or-later, not covered by Agartha's MIT license. Source and license details: https://www.blender.org/about/license/ and https://download.blender.org/source/. Network access to a hosted worker does not itself distribute a software copy; any separate distribution of binaries, images or Blender-derived add-ons must satisfy applicable GPL obligations. Ordinary generated model files are not relicensed under GPL merely by using Blender. Input assets retain their own licenses.

The image also checks out `ahujasid/blender-mcp` at `c5f35d9cc54451d785ac4c00c48bf9e98a2e8db9`. Its upstream LICENSE is MIT, copyright (c) 2025 Siddharth Ahuja, and remains in `/opt/blender-mcp/LICENSE`. Preserve it with copies. Source: https://github.com/ahujasid/blender-mcp/tree/c5f35d9cc54451d785ac4c00c48bf9e98a2e8db9. The upstream MIT label does not override Blender's requirements for distributed combined or derived Blender code.

Agartha Compute is an independent service using Blender, not affiliated with or endorsed by Blender Foundation. Blender is a registered trademark of Blender Foundation. Follow https://www.blender.org/about/trademark-policy/; do not use Blender as our product or domain name without permission.

## Build-time datasets

`caniuse-lite` contains browser compatibility data under CC-BY-4.0; its upstream attribution and license are included in the installed package. `mdn-data` is CC0-1.0. These are dependency data, not original Agartha assets. Preserve applicable attribution if redistributing either dataset.

## Fox model verification fixture

`scripts/fixtures/Fox.glb` is the unmodified Khronos glTF sample. Model by PixelMannen (CC0-1.0); rigging/animation by tomkranis and glTF conversion by @AsoboStudio and @scurest (CC-BY-4.0). Full source and attribution are in `scripts/fixtures/Fox-LICENSE.md`.
