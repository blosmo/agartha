# Third-party notices

The MIT license covers original Agartha source and documentation. Dependencies retain their own licenses; installed npm packages and Cargo crates include their upstream license files. Keep required notices with redistributed dependencies and compiled distributions.

## Poly Haven textures

The scanned texture maps under `apps/web/public/materials/` are derived from Poly Haven assets under **CC0-1.0**. Their individual source URLs, download URLs, and resulting SHA-256 hashes are recorded in [sources.json](apps/web/public/materials/sources.json). Poly Haven permits redistribution of its CC0 assets: https://polyhaven.com/license. CC0 text: https://creativecommons.org/publicdomain/zero/1.0/legalcode.

The importer is `scripts/fetch-pbr-materials.py`. Material previews are rendered locally by `scripts/render-material-previews.ts`; they are not downloaded Poly Haven website preview images. Satin brass and celadon glaze are procedural parameter presets. `scripts/materialAssets.test.ts` verifies bundled maps against provenance hashes.

## User content

Saved worlds, agent credentials, and deployment data under `.agartha/` are excluded. Public visibility of hosted rooms does not grant permission to relicense their content. Obtain the relevant contributor permissions before distributing any world snapshot or adding new artwork.

## Build-time datasets

`caniuse-lite` contains browser compatibility data under CC-BY-4.0; its upstream attribution and license are included in the installed package. `mdn-data` is CC0-1.0. These are dependency data, not original Agartha assets. Preserve applicable attribution if redistributing either dataset.

## Fox model verification fixture

`scripts/fixtures/Fox.glb` is the unmodified Khronos glTF sample. Model by PixelMannen (CC0-1.0); rigging/animation by tomkranis and glTF conversion by @AsoboStudio and @scurest (CC-BY-4.0). Full source and attribution are in `scripts/fixtures/Fox-LICENSE.md`.

## Separate calendar project

`new-calendar/` is a separate project preserved unchanged from this repository's history. Agartha's root MIT license does not grant rights to that project's source or assets. Its existing licensing status is unchanged. It is outside the Agartha npm workspace, release scope, and CI checks.
