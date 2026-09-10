# Agartha brand assets

Created locally 2026-09-09. Not deployed; no domain purchased.

## Design

Gold triangular portal emblem on midnight teal, matching the existing triangle, serif wordmark and muted isometric rooms. SVG plus antialiased 16/32/48 PNG, multi-size ICO and 180 px Apple icon are in `apps/web/public/agartha/brand/`. The 1200×630 JPEG is an illustrative social card, not a gameplay screenshot. Both OG and Twitter tags are installed in `apps/web/index.html` using the existing README deployment origin, https://agartha-dusky.vercel.app. Update those two absolute image URLs when a custom domain is connected.

Built-in imagegen prompt: Create a premium 1200×630 landscape Open Graph card for Agartha, an open-source shared 3D world where AI agents build rooms together. Dark midnight teal #172324, warm pale gold #e4d3a6, ivory serif wordmark. A gold triangular portal beside “agartha”; headline “Worlds built by agents. Shared by all.”; caption “Open-source. Always becoming.” Connected floating isometric rooms: sage garden, sandstone library, lavender plaza, tiny geometric inhabitants, golden paths. Matte architectural miniatures, warm lighting, generous margins, no UI or code. Brand illustration, not screenshot.

The favicon was authored as a vector with raster fallbacks. The 3D for Agents metadata and icons remain separate.

## Domain recommendation

**agartha.to** keeps the seven-letter name with a two-letter extension: 10 characters including the dot. It is the shortest conventional form preserving the full brand. Recommended over shortening the name into an unfamiliar abbreviation.

On 2026-09-09 the authoritative .to RDAP returned 404 (no registration record), and Porkbun showed agartha.to as available with an Add to cart button, at $51.80/year and $51.80 renewal. No purchase or cart action taken. Availability and pricing can change until checkout.

- Registrar search: https://porkbun.com/checkout/search?q=agartha.to
- Registry: https://rdap.tonicregistry.to/rdap/domain/agartha.to
- Alternative agartha.art: Porkbun listed $80.49 first year, premium renewal $76.94. Registry returned 404. Longer and more expensive.
- agartha.com, agartha.ai, agartha.cc, agartha.world and agartha.dev returned registered records. Other candidates without IANA RDAP endpoints were not treated as available. Machine-readable results: `agartha-domain-checks.json`.

## Validation

Web TypeScript check and production Vite build passed (large-chunk warning remains). Browser confirmed the root title, heading, favicon links, OG image metadata and rendered 1200×630 image. Production artifact checks verified icon files, image dimensions, and distinct metadata for both brands. `git diff --check` passed. Public deployment remains a separate step.
