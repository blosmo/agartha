# Poly Haven reuse

Use existing Agartha components and procedural templates first. When a ready-made prop fits the brief, search Poly Haven before building it from scratch. Keep bespoke geometry and exact product identities subject to the brief and reference review. Do not force an unrelated asset into the scene.

## Managed modeling

After the operator enables `BLENDER_POLYHAVEN_ENABLED=true` on the web/gateway with compatible broker and worker versions, the managed modeling agent can use these `blender_action` operations:

- `search_polyhaven`: `code` is JSON such as `{"q":"soccer ball"}`. Results include asset IDs, descriptions, source pages, preview URLs and a cursor. Pass the same query and returned cursor for the next page. Search is a keyword match over names, tags, categories and descriptions.
- `load_polyhaven`: `code` is `{"id":"dirty_football","name":"Soccer ball","location":[0,0,0],"rotation":[0,0,0],"scale":[1,1,1]}`. Select an ID, never an arbitrary URL. Placement uses Blender XYZ, Z-up, with rotations in radians. Each load creates a named editable component and renders a candidate that still requires review and acceptance.

The trusted service downloads a 1K static glTF, verifies manifest sizes and MD5 checksums, and embeds its geometry and PNG/JPEG textures into a SHA-256-identified GLB. Downloads are limited to Poly Haven's known hosts, without Agartha credentials or redirects. The total download and packaged GLB are each limited to 16 MB. Managed loads use a deadline of up to 60 seconds, shortened to preserve delivery time, with cancellation checks between requests and during streaming. Unsupported formats, missing dependencies, large textures and unavailable assets return an error; choose another model or continue authoring. Downloaded Blender files and scripts are never executed.

Inspect the imported shape, orientation, materials and dimensions. A search result does not establish exact product identity or accurate physical dimensions. Existing export, rendering and visual acceptance checks still apply. Provider requests are free; managed inference and Blender work remain within the existing job budget.

Source URLs and CC0 provenance are retained on imported component objects, in assembly manifests, editable source files and the job's review trace. Keep Poly Haven credit in delivery notes. Loading does not publish a public asset; the existing explicit component-sharing setting controls public contributions.

## Local agents and people

From the repository root, use Python with the broker's existing `httpx` and Pillow dependencies:

```sh
python -m cloud.blender_billing.polyhaven search "soccer ball"
python -m cloud.blender_billing.polyhaven download dirty_football --output /tmp/football
```

The output directory must be new. Download writes `model.glb` and `metadata.json` and prints a machine-readable JSON result. Errors use JSON on stderr with a nonzero exit code. The command prepares local files; it does not upload or publish them. Use the existing [GLB model import](glb-models.md) workflow, preserving `source`, `license` and `attribution` from the metadata, to add a reviewed model to a world. Agartha's normal model validation remains authoritative.

In a Blender session with Agartha's toolkit, use `cloud.blender_mcp.components.import_polyhaven(path, name, asset_id="dirty_football")` on the prepared GLB to retain provenance. Duplicating the component preserves it. Exported editable source is a Blender representation of the imported mesh, not the artist's original authoring file.

For surface finishes, use the existing bundled [Poly Haven PBR materials](materials.md) or shared material workflow. This integration adds live model discovery and import; it does not add live HDRI or texture-catalog downloads.

## Credit and upstream terms

Powered by [Poly Haven](https://polyhaven.com/). Assets are CC0. The live API requires a recognizable application User-Agent and visible provider credit; the client sends `Agartha-3DForAgents/1.0`, and managed creation shows a Poly Haven credit. Applications surfacing these results should also preserve the provider label. The API is best effort, so authoring must remain usable during an outage.

Official references: [API and integration guidance](https://polyhaven.com/our-api), [API terms](https://github.com/Poly-Haven/Public-API/blob/master/ToS.md).
