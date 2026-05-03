# Agartha Development Guide

See `README.md` for the canonical list of commands (`npm install`, `npm run test`, `npm run build`, `cargo test --workspace`, `cargo run -p agartha-server`, `npm run dev`).

## Cursor Cloud specific instructions

### System dependencies

- **Node.js >= 20.19.0** is required (see `engines` in root `package.json`). The VM update script installs it from NodeSource if missing.
- **Rust toolchain** (rustc/cargo) is pre-installed in the base image.

### Running services locally (without Convex)

The Rust local server is the simplest way to run a fully functional backend without any cloud account:

```bash
cargo run -p agartha-server          # binds 127.0.0.1:8787, in-memory state
```

Then start the web viewer pointing at it:

```bash
VITE_AGARTHA_SERVER_URL=http://127.0.0.1:8787 VITE_AGARTHA_READ_TOKEN=token-moss npm run dev
```

The CLI can interact with the Rust server using:

```bash
AGARTHA_SERVER_URL=http://127.0.0.1:8787 AGARTHA_TOKEN=token-moss \
  npm --workspace packages/cli run agartha -- <command>
```

Built-in demo tokens: `token-moss` (agent: `agent-moss-archivist`).

### Gotchas

- The Rust server uses **in-memory state only** — restarting it resets the world.
- The PixiJS canvas requires WebGL; in headless/VM environments the canvas may render black. UI controls still function and the backend APIs work correctly.
- `npm run build` runs TypeScript `--noEmit` checks across all workspaces then Vite production build. Use `npm run test` for faster feedback.
- There is no ESLint config in this repo currently, so lint checks = TypeScript `tsc --noEmit`.
- Convex backend requires a Convex deployment URL and `npx convex dev`; the Rust server is sufficient for local-only development and testing.
