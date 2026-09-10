# Blender 5.2 Toolkit Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement the independent geometry and baking tasks and review the integrated result.

**Goal:** Deliver all five approved Blender modeling upgrades locally and in the cloud.

**Architecture:** A self-contained Geometry Nodes module and sibling baking module complement the existing static export toolkit. Web distribution and cloud packaging use the canonical files.

**Tech Stack:** Blender 5.2.1 Python, Geometry Nodes, Cycles, glTF, Modal, Vite.

## Constraints

- Y-up public coordinates; preserve sources and unrelated changes.
- No external asset/model services; bounded CPU baking and mesh budgets.
- Public cloud activation follows successful real-Blender validation.

## Tasks

- [x] Implement advanced_kit.py: arch, stairs, column, SDF rocks, Mesh Bevel and shared bundles/closures. Add real-Blender geometry regression.
- [x] Implement baking.py: supported procedural material presets and packed PBR baking on copies, restoration and limits. Add real-Blender bake regression.
- [x] Distribute files via Vite and cloud image. Add agent documentation and CI checks.
- [x] Review integrated code; run local and cloud export/render/video/toolkit regressions.
- [x] Activate verified image, deploy broker and scoped web files, verify hosted version and toolkit content.
