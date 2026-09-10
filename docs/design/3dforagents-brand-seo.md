# 3D for Agents branding and SEO

Implemented locally on 2026-09-09; not deployed.

## Assets

- `apps/web/public/compute/brand/og-image.jpg`: 1200×630, approximately 120 KB.
- Root favicon SVG, 32/48 px PNG, ICO, and 180 px Apple touch icon: mint isometric cube on forest green. Vector authored directly for small-size legibility.
- OG artwork generated with the built-in imagegen tool, then resized and JPEG encoded.

Generation prompt: Create a premium 1200×630 Open Graph card for 3dforagents.com. Warm ivory #f4f3ec background, forest #192e2b typography. Brand “3D for Agents”; headline “Beautiful 3D models. Made by your agent.”; footer “Cloud Blender · HTTP + MCP”. Floating mint ceramic beveled cube, apricot tetrahedron, lavender torus, realistic soft shadows, restrained editorial typography, generous margins, no additional words or interface screenshots.

## SEO audit and fixes

Applied https://github.com/coreyhaines31/marketingskills/blob/main/skills/seo-audit/SKILL.md (read remotely; no local SEO skill installed).

- High priority: missing social metadata and image. Added complete Open Graph and Twitter large-image tags, with absolute image URL, dimensions and alt text.
- Medium priority: vague search title. Added descriptive AI 3D modeling, cloud Blender and MCP title, description and natural visible intro copy.
- Medium priority: missing crawler discovery files. Added robots.txt and a single canonical landing URL sitemap. No fabricated modification dates; API routes excluded from crawling, payment pages retain their existing noindex headers.
- Medium priority: missing favicon. Added SVG and raster browser/Apple variants.
- Added factual WebPage JSON-LD. No fabricated ratings, offers or rich-result eligibility claims.
- Live HTTP inspection confirmed root redirects 308 to /compute/, which returns 200. Preserved that canonical route and existing redirects.

## Verification

Web TypeScript check and Vite production build passed (existing large-chunk warning). Browser verified landing appearance, title, canonical, social image, JSON-LD, favicon links and one H1. Production artifact checks confirmed favicon files exist, JPEG is 1200×630, sitemap XML parses and matches the canonical, and robots.txt references the sitemap. Diff whitespace check passed.

The local creation API was unavailable; no paid generation or transaction was tested. Search Console indexing, field performance and ranking changes are unmeasured. After deployment, verify public assets and submit the sitemap in Search Console.
