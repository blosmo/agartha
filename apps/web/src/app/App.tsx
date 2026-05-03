import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ActionEnvelope, ActionResult } from "@agartha/protocol/actions";
import { MATERIAL, MATERIAL_NAME, toWorldCoord, type MaterialId, type WorldCoord } from "@agartha/protocol/world";

import {
  DEFAULT_TOOL_SETTINGS,
  DEFAULT_PAINT_SWATCHES,
  MATERIAL_TOOL_DEFAULTS,
  absoluteCoord,
  applyMaterialTool,
  applyMaterialStroke,
  captureCellObject,
  cellKey,
  DEFAULT_TERRAIN_SEED,
  INITIAL_DEMO_CELLS,
  TERRAIN_SEEDS,
  demoCell,
  generateTerrain,
  stampCellObjectPattern,
  stepDemoWorld,
  type CellObjectTemplate,
  type DemoCell,
  type DemoEvent,
  type MaterialToolSettings,
  type NewPaintSwatch,
  type PaintSwatch,
} from "./demoWorld";
import { BoardCanvas, type CellSelection } from "../board/BoardCanvas";
import {
  paintCellsEnvelope,
  placeMaterialEnvelope,
  readConvexWriteConfig,
  useConvexAct,
  useConvexClearAllCells,
  useConvexObjectTemplates,
  useConvexPaintBrowserCells,
  useConvexResetWorldTime,
  useConvexSaveObjectTemplate,
  useConvexStepWorld,
  useConvexWorldSnapshot,
  type ConvexWriteConfig,
  type ConvexWorldSnapshot,
} from "../api/convexWorldClient";
import { fetchServerWorldSnapshot, readServerWorldConfig, type ServerCollaborationContext } from "../api/worldClient";
import { AgarthaConvexProvider, readConvexUrl } from "./ConvexProvider";
import { AgentCliBar } from "../controls/AgentCommandPanel";
import { MaterialEditorPanel, ToolDock } from "../controls/MaterialEditorPanel";
import { ObjectLibraryPanel } from "../controls/ObjectLibraryPanel";
import { TerrainSeedPanel } from "../controls/TerrainSeedPanel";
import { TimeControls } from "../controls/TimeControls";
import { CellInspector } from "../inspector/CellInspector";
import { EventHistoryPanel } from "../inspector/EventHistoryPanel";
import { ReplayControls } from "../replay/ReplayControls";
import "./layout.css";

type UIMode = "human" | "agent";
type WorldSourceState = {
  readonly apiUrl?: string;
  readonly chunkVersions?: Record<string, number>;
  readonly connection: "local" | "connecting" | "connected" | "error" | "missing_token";
  readonly message: string;
  readonly mode: "local_demo" | "server_backed" | "convex_backed";
};

const SERVER_WORLD_CONFIG = readServerWorldConfig(import.meta.env);
const CONVEX_URL = readConvexUrl(import.meta.env);
const CONVEX_WRITE_CONFIG = readConvexWriteConfig(import.meta.env);

const AGENT_COMMANDS = [
  "masterpiece phoenix x y [scale]",
  "masterpiece lotus x y [scale]",
  "flower x y",
  "garden x y",
  "paint slot x y radius",
  "material name x y radius",
  "color slot #rrggbb",
  "object save name x y width height",
  "object stamp name x y [repeat stepX stepY]",
];

type ConvexActMutation = ReturnType<typeof useConvexAct>;
type ConvexClearAllCellsMutation = ReturnType<typeof useConvexClearAllCells>;
type ConvexSaveObjectTemplateMutation = ReturnType<typeof useConvexSaveObjectTemplate>;
type ConvexPaintBrowserCellsMutation = ReturnType<typeof useConvexPaintBrowserCells>;
type ConvexResetWorldTimeMutation = ReturnType<typeof useConvexResetWorldTime>;
type ConvexStepWorldMutation = ReturnType<typeof useConvexStepWorld>;

export function App({
  convexAct,
  convexClearAllCells,
  convexObjectTemplates,
  convexPaintBrowserCells,
  collaborationContext: initialCollaborationContext,
  convexResetWorldTime,
  convexSaveObjectTemplate,
  convexSnapshot,
  convexStepWorld,
  convexUrl = CONVEX_URL,
  convexWriteConfig = CONVEX_WRITE_CONFIG,
}: {
  readonly convexAct?: ConvexActMutation;
  readonly convexClearAllCells?: ConvexClearAllCellsMutation;
  readonly convexObjectTemplates?: readonly CellObjectTemplate[];
  readonly convexPaintBrowserCells?: ConvexPaintBrowserCellsMutation;
  readonly collaborationContext?: ServerCollaborationContext;
  readonly convexResetWorldTime?: ConvexResetWorldTimeMutation;
  readonly convexSaveObjectTemplate?: ConvexSaveObjectTemplateMutation;
  readonly convexSnapshot?: ConvexWorldSnapshot;
  readonly convexStepWorld?: ConvexStepWorldMutation;
  readonly convexUrl?: string | null;
  readonly convexWriteConfig?: ConvexWriteConfig;
} = {}) {
  const isAuthoritativeMode = Boolean(convexUrl || SERVER_WORLD_CONFIG);
  const [uiMode, setUiMode] = useState<UIMode>("human");
  const [cells, setCells] = useState<DemoCell[]>(() => (isAuthoritativeMode ? [] : INITIAL_DEMO_CELLS));
  const [terrainSeedId, setTerrainSeedId] = useState(DEFAULT_TERRAIN_SEED.id);
  const [toolSettings, setToolSettings] = useState<MaterialToolSettings>(DEFAULT_TOOL_SETTINGS);
  const [paintSwatches, setPaintSwatches] = useState<PaintSwatch[]>(DEFAULT_PAINT_SWATCHES);
  const [selectedCoord, setSelectedCoord] = useState<WorldCoord>(INITIAL_DEMO_CELLS[0].coord);
  const [selection, setSelection] = useState<CellSelection | undefined>();
  const [objectTemplates, setObjectTemplates] = useState<CellObjectTemplate[]>([]);
  const [undoStack, setUndoStack] = useState<DemoCell[][]>([]);
  const [redoStack, setRedoStack] = useState<DemoCell[][]>([]);
  const [tick, setTick] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [events, setEvents] = useState<DemoEvent[]>(() =>
    isAuthoritativeMode
      ? [{ id: "authoritative-connecting", tick: 0, summary: "Connecting to authoritative world state" }]
      : [{ id: "demo-0001", tick: 0, summary: "Seeded origin materials" }],
  );
  const [pendingConvexCells, setPendingConvexCells] = useState<DemoCell[]>([]);
  const [collaborationContext, setCollaborationContext] = useState<ServerCollaborationContext | undefined>(initialCollaborationContext);
  const timeMutationPendingRef = useRef(false);
  const [worldSource, setWorldSource] = useState<WorldSourceState>(
    convexUrl
      ? {
          apiUrl: convexUrl,
          connection: "connecting",
          message: "Connecting to Convex authoritative state",
          mode: "convex_backed",
        }
      : SERVER_WORLD_CONFIG
      ? {
          apiUrl: SERVER_WORLD_CONFIG.baseUrl,
          connection: SERVER_WORLD_CONFIG.token ? "connecting" : "missing_token",
          message: SERVER_WORLD_CONFIG.token
            ? "Connecting to authoritative server state"
            : "Server-backed Canvas mode needs VITE_AGARTHA_READ_TOKEN",
          mode: "server_backed",
        }
        : {
            connection: "local",
            message: "Rendering browser-local demo state",
            mode: "local_demo",
          },
  );
  const selectedCell = useMemo(
    () => cells.find((cell) => cell.id === cellKey(selectedCoord)),
    [cells, selectedCoord],
  );
  const latestEvent = events[0];
  const agentCommandSuggestions = useMemo(
    () => buildAgentCommandSuggestions(selectedCoord, toolSettings.paintVariant),
    [selectedCoord, toolSettings.paintVariant],
  );

  useEffect(() => {
    if (convexUrl || !SERVER_WORLD_CONFIG) return;

    let cancelled = false;
    let timer: number | undefined;

    async function refreshServerWorld() {
      try {
        const snapshot = await fetchServerWorldSnapshot(SERVER_WORLD_CONFIG!);
        if (cancelled) return;

        setCells(snapshot.cells);
        setUndoStack([]);
        setRedoStack([]);
        setIsPlaying(false);
        setTick(snapshot.events[0]?.tick ?? 0);
        setEvents(
          snapshot.events.length > 0
            ? snapshot.events
            : [{ id: "server-0000", tick: 0, summary: "Connected to authoritative server state" }],
        );
        setCollaborationContext(snapshot.collaboration);
        setSelectedCoord((current) =>
          snapshot.cells.some((cell) => cell.id === cellKey(current)) ? current : snapshot.cells[0]?.coord ?? current,
        );
        setWorldSource({
          apiUrl: SERVER_WORLD_CONFIG!.baseUrl,
          chunkVersions: snapshot.chunkVersions,
          connection: "connected",
          message: `Rendering authoritative server state from ${SERVER_WORLD_CONFIG!.baseUrl}`,
          mode: "server_backed",
        });
      } catch (error) {
        if (cancelled) return;
        setWorldSource({
          apiUrl: SERVER_WORLD_CONFIG!.baseUrl,
          connection: error instanceof Error && "reason" in error && error.reason === "missing_token" ? "missing_token" : "error",
          message: error instanceof Error ? error.message : "Unable to load authoritative server state",
          mode: "server_backed",
        });
      }
    }

    void refreshServerWorld();
    timer = window.setInterval(() => {
      void refreshServerWorld();
    }, 1200);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [convexUrl]);

  useEffect(() => {
    if (!convexUrl || !convexSnapshot) return;
    const unresolvedPendingCells = pendingConvexCells.filter((cell) => !snapshotHasCell(convexSnapshot.cells, cell));
    if (unresolvedPendingCells.length !== pendingConvexCells.length) setPendingConvexCells(unresolvedPendingCells);
    setCells(mergeCells(convexSnapshot.cells, unresolvedPendingCells));
    setUndoStack([]);
    setRedoStack([]);
    setTick(convexSnapshot.tick);
    setEvents(
      convexSnapshot.events.length > 0
        ? [...convexSnapshot.events]
        : [{ id: "convex-0000", tick: convexSnapshot.tick, summary: "Connected to empty Convex authoritative world" }],
    );
    setCollaborationContext(undefined);
    setSelectedCoord((current) =>
      convexSnapshot.cells.some((cell) => cell.id === cellKey(current)) ? current : convexSnapshot.cells[0]?.coord ?? current,
    );
    setWorldSource({
      apiUrl: convexUrl,
      chunkVersions: convexSnapshot.chunkVersions,
      connection: "connected",
      message: "Rendering Convex authoritative state",
      mode: "convex_backed",
    });
  }, [convexSnapshot, pendingConvexCells, convexUrl]);

  useEffect(() => {
    if (!convexUrl || !convexObjectTemplates) return;
    setObjectTemplates((current) => mergeObjectTemplates(convexObjectTemplates, current));
  }, [convexObjectTemplates, convexUrl]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      advanceTime();
    }, 650);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  function applyTool(coord: WorldCoord) {
    if (toolSettings.mode === "cursor") {
      setSelectedCoord(coord);
      setSelection({ height: 1, origin: coord, width: 1 });
      return;
    }

    if (toolSettings.mode === "marquee") {
      setSelection({ height: 1, origin: coord, width: 1 });
      setSelectedCoord(coord);
      return;
    }

    if (toolSettings.mode === "stamp") {
      const template = objectTemplates.find((candidate) => candidate.id === toolSettings.objectId) ?? objectTemplates[0];
      if (!template) {
        setEvents((eventList) => [
          {
            id: `demo-${String(eventList.length + 1).padStart(4, "0")}`,
            tick,
            summary: "Stamp tool: choose or capture an object first",
          },
          ...eventList,
        ]);
        return;
      }

      const result = stampCellObjectPattern(cells, template, coord, {
        repeat: toolSettings.stampRepeat,
        stepX: toolSettings.stampStepX,
        stepY: toolSettings.stampStepY,
      });
      const summary =
        result.placements === 1
          ? `Stamp tool: placed ${template.label} with ${result.affected} cells near ${cellKey(coord)}`
          : `Stamp tool: placed ${result.placements} ${template.label} objects with ${result.affected} cells from ${cellKey(coord)}`;
      if (convexUrl) {
        void submitConvexMaterialEdit(cells, result.cells, coord, "stamp");
        return;
      }
      if (blockServerBackedMutation("Stamp edits are disabled in server-backed mode. Use agartha CLI/API.")) return;
      commitCells(result.cells, summary, coord);
      return;
    }

    const result = applyMaterialTool(cells, coord, toolSettings);
    if (convexUrl) {
      void submitConvexMaterialEdit(cells, result.cells, coord, "tool");
      return;
    }
    if (blockServerBackedMutation("Browser tool edits are disabled in server-backed mode. Use agartha CLI/API.")) return;

    setSelectedCoord(coord);
    if (result.affected > 0) {
      setUndoStack((current) => [cells, ...current].slice(0, 24));
      setRedoStack([]);
    }
    setCells(result.cells);
    setEvents((eventList) => [
      {
        id: `demo-${String(eventList.length + 1).padStart(4, "0")}`,
        tick,
        summary: `${toolLabel(toolSettings.mode)} tool: ${editSummary(result.affected, coord, result.material)}`,
      },
      ...eventList,
    ]);
  }

  function applyStroke(coords: readonly WorldCoord[]) {
    if (coords.length === 0) return;

    const result = applyMaterialStroke(cells, coords, toolSettings);
    const finalCoord = coords[coords.length - 1];
    if (convexUrl) {
      void submitConvexMaterialEdit(cells, result.cells, finalCoord, "stroke");
      return;
    }
    if (blockServerBackedMutation("Browser paint strokes are disabled in server-backed mode. Use agartha CLI/API.")) return;

    setSelectedCoord(finalCoord);
    if (result.affected > 0) {
      setUndoStack((current) => [cells, ...current].slice(0, 24));
      setRedoStack([]);
    }
    setCells(result.cells);
    setEvents((eventList) => [
      {
        id: `demo-${String(eventList.length + 1).padStart(4, "0")}`,
        tick,
        summary: `${toolLabel(toolSettings.mode)} stroke: ${editSummary(result.affected, finalCoord, result.material)}`,
      },
      ...eventList,
    ]);
  }

  function applyShape(coords: readonly WorldCoord[]) {
    if (coords.length === 0) return;

    const shapeSettings: MaterialToolSettings = { ...toolSettings, mode: "paint" };
    const result = applyMaterialStroke(cells, coords, shapeSettings);
    const finalCoord = coords[coords.length - 1];
    if (convexUrl) {
      void submitConvexMaterialEdit(cells, result.cells, finalCoord, "shape");
      return;
    }
    if (blockServerBackedMutation("Browser shape edits are disabled in server-backed mode. Use agartha CLI/API.")) return;

    setSelectedCoord(finalCoord);
    if (result.affected > 0) {
      setUndoStack((current) => [cells, ...current].slice(0, 24));
      setRedoStack([]);
    }
    setCells(result.cells);
    setEvents((eventList) => [
      {
        id: `demo-${String(eventList.length + 1).padStart(4, "0")}`,
        tick,
        summary: `Shape drag: ${editSummary(result.affected, finalCoord, result.material)}`,
      },
      ...eventList,
    ]);
  }

  function commitCells(nextCells: DemoCell[], summary: string, coord?: WorldCoord, previousCells = cells) {
    if (blockServerBackedMutation("Browser cell commits are disabled in server-backed mode. Use agartha CLI/API.")) return;
    setUndoStack((current) => [previousCells, ...current].slice(0, 24));
    setRedoStack([]);
    setCells([...nextCells]);
    if (coord) setSelectedCoord(coord);
    setEvents((eventList) => [
      {
        id: `demo-${String(eventList.length + 1).padStart(4, "0")}`,
        tick,
        summary,
      },
      ...eventList,
    ]);
  }

  async function submitConvexMaterialEdit(
    previousCells: readonly DemoCell[],
    nextCells: readonly DemoCell[],
    coord: WorldCoord,
    gesture: "shape" | "stamp" | "tool" | "stroke",
  ) {
    setSelectedCoord(coord);

    if ((!convexPaintBrowserCells && !convexAct) || !convexWriteConfig) {
      setWorldSource((current) => ({
        ...current,
        message: "Convex painting needs VITE_AGARTHA_WRITE_TOKEN in the local web app environment.",
      }));
      return;
    }

    if ((toolSettings.mode === "eraser" || toolSettings.material === MATERIAL.Empty) && !convexPaintBrowserCells) {
      setWorldSource((current) => ({
        ...current,
        message: "Convex erasing needs the browser cell mutation; authoritative action envelopes can add material only.",
      }));
      return;
    }

    const targets = changedCoords(previousCells, nextCells);
    if (targets.length === 0) {
      setWorldSource((current) => ({
        ...current,
        message: `${toolLabel(toolSettings.mode)} ${gesture}: no material changes to submit`,
      }));
      return;
    }

    const nextById = new Map(nextCells.map((cell) => [cell.id, cell]));
    const previousById = new Map(previousCells.map((cell) => [cell.id, cell]));
    const optimisticCells = targets
      .map((target) => {
        const key = cellKey(target);
        const nextCell = nextById.get(key);
        if (nextCell) return nextCell;
        const previousCell = previousById.get(key);
        if (!previousCell) return undefined;
        return { ...previousCell, material: MATERIAL.Empty, state: 0, variant: 0, flags: 0 };
      })
      .filter((cell): cell is DemoCell => Boolean(cell));

    if (convexPaintBrowserCells) {
      await submitConvexBrowserCells(nextCells, optimisticCells, gesture);
      return;
    }

    let envelopes: ActionEnvelope[];
    if (targets.length === 1) {
      envelopes = [
        placeMaterialEnvelope(
          convexWriteConfig,
          targets[0],
          optimisticCells[0].material as Exclude<MaterialId, typeof MATERIAL.Empty>,
          optimisticCells[0].variant,
        ),
      ];
    } else if (toolSettings.material === MATERIAL.Paint) {
      envelopes = [
        paintCellsEnvelope(
          convexWriteConfig,
          targets,
          toolSettings.paintVariant,
        ),
      ];
    } else {
      envelopes = optimisticCells.map((cell) =>
        placeMaterialEnvelope(
          convexWriteConfig,
          cell.coord,
          cell.material as Exclude<MaterialId, typeof MATERIAL.Empty>,
          cell.variant,
        ),
      );
    }

    const submitAct = convexAct;
    if (!submitAct) return;

    setCells([...nextCells]);
    setPendingConvexCells((current) => mergePendingCells(current, optimisticCells));
    setWorldSource((current) => ({
      ...current,
      message: `Submitting ${convexEditLabel(toolSettings.mode, gesture)} to Convex`,
    }));

    try {
      const results: ActionResult[] = [];
      for (const envelope of envelopes) {
        results.push(await submitAct({ envelope, token: convexWriteConfig.token }));
      }
      const rejected = results.find((result) => !result.accepted);
      setWorldSource((current) => ({
        ...current,
        message: rejected
          ? `Convex action rejected: ${rejected.reason ?? rejected.summary}`
          : results.length === 1
          ? `${results[0].summary}; waiting for Convex realtime state`
          : `${convexEditLabel(toolSettings.mode, gesture)} accepted: ${optimisticCells.length} cells; waiting for Convex realtime state`,
      }));
      if (rejected) {
        setPendingConvexCells((current) => current.filter((cell) => !optimisticCells.some((optimistic) => sameCell(cell, optimistic))));
      }
    } catch (error) {
      setPendingConvexCells((current) => current.filter((cell) => !optimisticCells.some((optimistic) => sameCell(cell, optimistic))));
      setWorldSource((current) => ({
        ...current,
        connection: "error",
        message: error instanceof Error ? error.message : "Unable to submit browser paint to Convex",
      }));
    }
  }

  async function submitConvexBrowserCells(
    nextCells: readonly DemoCell[],
    optimisticCells: readonly DemoCell[],
    gesture: "shape" | "stamp" | "tool" | "stroke",
  ) {
    if (!convexPaintBrowserCells || !convexWriteConfig) return;

    setCells([...nextCells]);
    setPendingConvexCells((current) => mergePendingCells(current, optimisticCells));
    setWorldSource((current) => ({
      ...current,
      message: `Submitting ${convexEditLabel(toolSettings.mode, gesture)} to Convex`,
    }));

    try {
      const result: ActionResult = await convexPaintBrowserCells({
        agentId: convexWriteConfig.agentId,
        cells: optimisticCells.map(({ coord, flags, material, state, variant }) => ({
          coord,
          flags,
          material,
          state,
          variant,
        })),
        token: convexWriteConfig.token,
        worldId: convexWriteConfig.worldId,
      });
      setWorldSource((current) => ({
        ...current,
        message: result.accepted
          ? `${convexEditLabel(toolSettings.mode, gesture)} accepted: ${optimisticCells.length} cells; waiting for Convex realtime state`
          : `Convex action rejected: ${result.reason ?? result.summary}`,
      }));
      if (!result.accepted) {
        setPendingConvexCells((current) => current.filter((cell) => !optimisticCells.some((optimistic) => sameCell(cell, optimistic))));
      }
    } catch (error) {
      setPendingConvexCells((current) => current.filter((cell) => !optimisticCells.some((optimistic) => sameCell(cell, optimistic))));
      setWorldSource((current) => ({
        ...current,
        connection: "error",
        message: error instanceof Error ? error.message : "Unable to submit browser paint to Convex",
      }));
    }
  }

  async function submitConvexClearAllCells() {
    if (!convexClearAllCells || !convexWriteConfig) {
      setWorldSource((current) => ({
        ...current,
        message: "Convex clear all needs VITE_AGARTHA_WRITE_TOKEN in the local web app environment.",
      }));
      return;
    }

    if (!window.confirm("Clear all Convex canvas cells for the shared Agartha world?")) return;

    setCells([]);
    setPendingConvexCells([]);
    setIsPlaying(false);
    setWorldSource((current) => ({
      ...current,
      message: "Clearing Convex canvas cells",
    }));

    try {
      const result: ActionResult = await convexClearAllCells({
        agentId: convexWriteConfig.agentId,
        token: convexWriteConfig.token,
        worldId: convexWriteConfig.worldId,
      });
      setWorldSource((current) => ({
        ...current,
        message: result.accepted
          ? `${result.summary}; waiting for Convex realtime state`
          : `Convex clear all rejected: ${result.reason ?? result.summary}`,
      }));
    } catch (error) {
      setWorldSource((current) => ({
        ...current,
        connection: "error",
        message: error instanceof Error ? error.message : "Unable to clear Convex canvas cells",
      }));
    }
  }

  function undoEdit() {
    if (blockServerBackedMutation("Undo is disabled in server-backed mode because state is owned by the server.")) return;
    const previousCells = undoStack[0];
    if (!previousCells) return;

    setUndoStack((current) => current.slice(1));
    setRedoStack((current) => [cells, ...current].slice(0, 24));
    setCells(previousCells);
    setSelectedCoord(previousCells[0]?.coord ?? selectedCoord);
    setEvents((eventList) => [
      {
        id: `demo-${String(eventList.length + 1).padStart(4, "0")}`,
        tick,
        summary: "Undo edit: restored previous canvas",
      },
      ...eventList,
    ]);
  }

  function redoEdit() {
    if (blockServerBackedMutation("Redo is disabled in server-backed mode because state is owned by the server.")) return;
    const nextCells = redoStack[0];
    if (!nextCells) return;

    setRedoStack((current) => current.slice(1));
    setUndoStack((current) => [cells, ...current].slice(0, 24));
    setCells(nextCells);
    setSelectedCoord(nextCells[0]?.coord ?? selectedCoord);
    setEvents((eventList) => [
      {
        id: `demo-${String(eventList.length + 1).padStart(4, "0")}`,
        tick,
        summary: "Redo edit: restored edited canvas",
      },
      ...eventList,
    ]);
  }

  function updateToolSettings(nextSettings: MaterialToolSettings) {
    setToolSettings(nextSettings);
  }

  function updatePaintSwatch(id: number, color: string) {
    setPaintSwatches((current) =>
      current.map((swatch) => (swatch.id === id ? { ...swatch, color } : swatch)),
    );
    if (SERVER_WORLD_CONFIG || convexUrl) return;
    setEvents((eventList) => [
      {
        id: `demo-${String(eventList.length + 1).padStart(4, "0")}`,
        tick,
        summary: `Updated ${paintLabel(id)} color to ${color}`,
      },
      ...eventList,
    ]);
  }

  function createPaintSwatch(material: NewPaintSwatch) {
    const cleanLabel = material.label.trim() || "New material";
    const cleanColor = /^#[0-9a-f]{6}$/i.test(material.color) ? material.color.toLowerCase() : "#88e060";
    const nextId = paintSwatches.reduce((maxId, swatch) => Math.max(maxId, swatch.id), -1) + 1;

    setPaintSwatches((current) => [
      ...current,
      {
        ...material,
        id: nextId,
        label: cleanLabel,
        color: cleanColor,
      },
    ]);
    setToolSettings((current) => ({
      ...current,
      material: MATERIAL.Paint,
      paintVariant: nextId,
      ...MATERIAL_TOOL_DEFAULTS[MATERIAL.Paint],
    }));
    if (SERVER_WORLD_CONFIG || convexUrl) return;
    setEvents((eventList) => [
      {
        id: `demo-${String(eventList.length + 1).padStart(4, "0")}`,
        tick,
        summary: `Saved material ${cleanLabel}`,
      },
      ...eventList,
    ]);
  }

  function runAgentCommand(command: string) {
    if (SERVER_WORLD_CONFIG && !convexUrl && blockServerBackedMutation("In-app agent commands are disabled in authoritative mode. Use the agartha CLI.")) {
      return "In-app agent commands are disabled in authoritative mode. Use the agartha CLI.";
    }

    const result = executeAgentCommand(command, cells, toolSettings, objectTemplates);

    if (result.kind === "error") {
      return result.message;
    }

    if (result.paintColor) {
      setPaintSwatches((current) =>
        current.map((swatch) =>
          swatch.id === result.paintColor?.id ? { ...swatch, color: result.paintColor.color } : swatch,
        ),
      );
    }

    if (result.paintColors) {
      setPaintSwatches((current) =>
        current.map((swatch) => {
          const paintColor = result.paintColors?.find((item) => item.id === swatch.id);
          return paintColor ? { ...swatch, color: paintColor.color } : swatch;
        }),
      );
    }

    if (result.template) {
      const template = result.template;
      setObjectTemplates((current) => upsertTemplate(current, template));
      setToolSettings((current) => ({ ...current, objectId: template.id }));
      if (convexUrl) void submitConvexObjectTemplate(template);
    }

    if (result.cells) {
      if (convexUrl && result.coord) {
        void submitConvexMaterialEdit(cells, result.cells, result.coord, "stamp");
        return result.summary;
      }
      commitCells(result.cells, result.summary, result.coord);
    } else {
      setEvents((eventList) => [
        {
          id: `demo-${String(eventList.length + 1).padStart(4, "0")}`,
          tick,
          summary: result.summary,
        },
        ...eventList,
      ]);
    }

    if (result.settings) {
      setToolSettings(result.settings);
    }

    return result.summary;
  }

  useEffect(() => {
    window.agarthaAgent = {
      commands: AGENT_COMMANDS,
      run: runAgentCommand,
    };

    return () => {
      delete window.agarthaAgent;
    };
  });

  function advanceTime() {
    if (convexUrl) {
      void submitConvexTimeStep();
      return;
    }
    if (blockServerBackedMutation("Server-backed time stepping is not available for this backend.")) return;
    setCells((current) => stepDemoWorld(current));
    setTick((currentTick) => {
      const nextTick = currentTick + 1;
      setEvents((current) => [
        {
          id: `demo-${String(current.length + 1).padStart(4, "0")}`,
          tick: nextTick,
          summary: `Advanced local simulation to tick ${nextTick}`,
        },
        ...current,
      ]);
      return nextTick;
    });
  }

  async function submitConvexTimeStep() {
    if (timeMutationPendingRef.current) return;
    if (!convexStepWorld || !convexWriteConfig) {
      setWorldSource((current) => ({
        ...current,
        message: "Convex time stepping needs VITE_AGARTHA_WRITE_TOKEN in the local web app environment.",
      }));
      return;
    }

    timeMutationPendingRef.current = true;
    setWorldSource((current) => ({
      ...current,
      message: "Advancing global Convex simulation",
    }));

    try {
      const result: ActionResult = await convexStepWorld({
        agentId: convexWriteConfig.agentId,
        token: convexWriteConfig.token,
        worldId: convexWriteConfig.worldId,
      });
      setWorldSource((current) => ({
        ...current,
        message: result.accepted
          ? `${result.summary}; waiting for Convex realtime state`
          : `Convex time step rejected: ${result.reason ?? result.summary}`,
      }));
    } catch (error) {
      setWorldSource((current) => ({
        ...current,
        connection: "error",
        message: error instanceof Error ? error.message : "Unable to advance Convex simulation",
      }));
    } finally {
      timeMutationPendingRef.current = false;
    }
  }

  function resetDemo() {
    if (blockServerBackedMutation("Local reset is disabled in server-backed mode.")) return;
    const seed = TERRAIN_SEEDS.find((terrainSeed) => terrainSeed.id === terrainSeedId) ?? DEFAULT_TERRAIN_SEED;
    const seededCells = generateTerrain(seed);
    setCells(seededCells);
    setUndoStack([]);
    setRedoStack([]);
    setTick(0);
    setIsPlaying(false);
    setSelectedCoord(seededCells[0].coord);
    setEvents([{ id: "demo-0001", tick: 0, summary: `Reset ${seed.label} terrain` }]);
  }

  function clearAllCells() {
    if (convexUrl) {
      void submitConvexClearAllCells();
      return;
    }
    if (blockServerBackedMutation("Local clear all is disabled in server-backed mode.")) return;
    setUndoStack((current) => [cells, ...current].slice(0, 24));
    setRedoStack([]);
    setCells([]);
    setIsPlaying(false);
    setEvents((eventList) => [
      {
        id: `demo-${String(eventList.length + 1).padStart(4, "0")}`,
        tick,
        summary: "Cleared all canvas cells",
      },
      ...eventList,
    ]);
  }

  function captureObject(label: string) {
    if (SERVER_WORLD_CONFIG && !convexUrl) {
      blockServerBackedMutation("Object capture is disabled in server-backed mode.");
      return "Object capture is disabled in server-backed mode.";
    }
    const captureSelection = selection ?? { height: 1, origin: selectedCoord, width: 1 };
    const template = captureCellObject(cells, label, captureSelection.origin, captureSelection.width, captureSelection.height);
    setObjectTemplates((current) => upsertTemplate(current, template));
    setToolSettings((current) => ({ ...current, mode: "stamp", objectId: template.id }));
    const summary = `Captured object ${template.label} with ${template.samples.length} cells`;
    if (convexUrl) {
      void submitConvexObjectTemplate(template);
      setWorldSource((current) => ({
        ...current,
        message: `Saving object ${template.label} to Convex`,
      }));
      return summary;
    }
    setEvents((eventList) => [
      {
        id: `demo-${String(eventList.length + 1).padStart(4, "0")}`,
        tick,
        summary,
      },
      ...eventList,
    ]);
    return summary;
  }

  async function submitConvexObjectTemplate(template: CellObjectTemplate) {
    if (!convexSaveObjectTemplate || !convexWriteConfig) {
      setWorldSource((current) => ({
        ...current,
        message: "Convex object capture needs VITE_AGARTHA_WRITE_TOKEN in the local web app environment.",
      }));
      return;
    }

    try {
      const result = await convexSaveObjectTemplate({
        agentId: convexWriteConfig.agentId,
        template,
        token: convexWriteConfig.token,
        worldId: convexWriteConfig.worldId,
      });
      setWorldSource((current) => ({
        ...current,
        message: result.accepted ? `${result.summary}; waiting for Convex realtime state` : `Convex object save rejected: ${result.summary}`,
      }));
    } catch (error) {
      setWorldSource((current) => ({
        ...current,
        connection: "error",
        message: error instanceof Error ? error.message : "Unable to save object template to Convex",
      }));
    }
  }

  function selectObjectTemplate(id: string) {
    setToolSettings((current) => ({ ...current, mode: "stamp", objectId: id }));
  }

  function updateStampPattern(repeat: number, stepX: number, stepY: number) {
    setToolSettings((current) => ({ ...current, stampRepeat: repeat, stampStepX: stepX, stampStepY: stepY }));
  }

  function updateSelection(nextSelection: CellSelection) {
    setSelection(nextSelection);
    setSelectedCoord(nextSelection.origin);
    if (SERVER_WORLD_CONFIG || convexUrl) {
      setWorldSource((current) => ({
        ...current,
      message: `Selected ${nextSelection.width}x${nextSelection.height} cells in authoritative view`,
      }));
      return;
    }
    setEvents((eventList) => [
      {
        id: `demo-${String(eventList.length + 1).padStart(4, "0")}`,
        tick,
        summary: `Selected ${nextSelection.width}x${nextSelection.height} cells for object capture`,
      },
      ...eventList,
    ]);
  }

  function selectTerrainSeed(seedId: string) {
    if (blockServerBackedMutation("Terrain seed switching is disabled in server-backed mode.")) return;
    const seed = TERRAIN_SEEDS.find((terrainSeed) => terrainSeed.id === seedId) ?? DEFAULT_TERRAIN_SEED;
    const seededCells = generateTerrain(seed);
    setTerrainSeedId(seed.id);
    setCells(seededCells);
    setUndoStack([]);
    setRedoStack([]);
    setTick(0);
    setIsPlaying(false);
    setSelectedCoord(seededCells[0].coord);
    setEvents([{ id: "demo-0001", tick: 0, summary: `Loaded ${seed.label} terrain seed ${seed.seed}` }]);
  }

  function resetTime() {
    if (convexUrl) {
      void submitConvexTimeReset();
      return;
    }
    if (blockServerBackedMutation("Server-backed time reset is not available for this backend.")) return;
    setTick(0);
    setIsPlaying(false);
  }

  async function submitConvexTimeReset() {
    if (!convexResetWorldTime || !convexWriteConfig) {
      setWorldSource((current) => ({
        ...current,
        message: "Convex time reset needs VITE_AGARTHA_WRITE_TOKEN in the local web app environment.",
      }));
      return;
    }

    setIsPlaying(false);
    setWorldSource((current) => ({
      ...current,
      message: "Resetting global Convex time",
    }));

    try {
      const result: ActionResult = await convexResetWorldTime({
        agentId: convexWriteConfig.agentId,
        token: convexWriteConfig.token,
        worldId: convexWriteConfig.worldId,
      });
      setWorldSource((current) => ({
        ...current,
        message: result.accepted
          ? `${result.summary}; waiting for Convex realtime state`
          : `Convex time reset rejected: ${result.reason ?? result.summary}`,
      }));
    } catch (error) {
      setWorldSource((current) => ({
        ...current,
        connection: "error",
        message: error instanceof Error ? error.message : "Unable to reset Convex time",
      }));
    }
  }

  function togglePlayback() {
    if (SERVER_WORLD_CONFIG && !convexUrl) {
      blockServerBackedMutation("Server-backed playback is not available for this backend.");
      return;
    }
    setIsPlaying((current) => !current);
  }

  function blockServerBackedMutation(message: string) {
    if (!SERVER_WORLD_CONFIG && !convexUrl) return false;
    setWorldSource((current) => ({
      ...current,
      message,
    }));
    return true;
  }

  return (
    <main
      aria-labelledby="agartha-app-title"
      className="agartha-app"
      data-agent-region="agartha-demo"
      data-ui-mode={uiMode}
    >
      <h1 className="sr-only" id="agartha-app-title">
        Agartha first demo
      </h1>
      <AgentStateBridge
        cells={cells.length}
        commands={AGENT_COMMANDS}
        latestEvent={latestEvent}
        mode={uiMode}
        objects={objectTemplates.length}
        selectedCoord={cellKey(selectedCoord)}
        selectedMaterial={materialLabel(selectedCell?.material ?? MATERIAL.Empty)}
        selection={selection}
        tool={toolSettings.mode}
        worldSource={worldSource}
        collaborationContext={collaborationContext}
      />
      <div className="sr-only" data-agent-id="latest-event-status" role="status" aria-live="polite">
        {latestEvent ? latestEvent.summary : "Ready"}
      </div>
      <div className="sr-only" data-agent-id="canvas-source-status" role="status" aria-live="polite">
        {worldSource.message}
      </div>
      <section className="agartha-board-shell" aria-label="Agartha board" data-agent-region="board">
        <ModeSwitch mode={uiMode} onChangeMode={setUiMode} />
    <BoardCanvas
          cells={cells}
          onApplyShape={applyShape}
          onApplyStroke={applyStroke}
          onApplyTool={applyTool}
          onMarqueeSelect={updateSelection}
          onSelectCell={setSelectedCoord}
          paintSwatches={paintSwatches}
          selectedCoord={selectedCoord}
          selection={selection}
          toolSettings={toolSettings}
        />
        {uiMode === "agent" ? (
          <AgentCliBar
            commands={agentCommandSuggestions}
            context={[
              { label: "tool", value: toolSettings.mode },
              {
                label: "material",
                value:
                  toolSettings.material === MATERIAL.Paint
                    ? paintSwatches.find((swatch) => swatch.id === toolSettings.paintVariant)?.label ?? paintLabel(toolSettings.paintVariant)
                    : materialLabel(toolSettings.material),
              },
              { label: "cell", value: cellKey(selectedCoord) },
              { label: "selection", value: selection ? `${selection.width}x${selection.height}` : "none" },
            ]}
            onRunCommand={runAgentCommand}
          />
        ) : (
          <ToolDock paintSwatches={paintSwatches} settings={toolSettings} onUpdateSettings={updateToolSettings} />
        )}
      </section>
      <aside className="agartha-side-panel" aria-label="Editor sidebar" data-agent-region="world-inspector">
        {uiMode === "agent" ? (
          <>
            <div className="agartha-side-panel__group" aria-label="Automation" data-agent-region="automation">
              <h2>Automation</h2>
              <AgentStatusPanel
                cells={cells.length}
                objects={objectTemplates.length}
                selectedCoord={cellKey(selectedCoord)}
                selection={selection}
                tool={toolSettings.mode}
              />
              <CollaborationPanel context={collaborationContext} worldSource={worldSource} />
              <ReplayControls />
            </div>
            <div className="agartha-side-panel__group" aria-label="Inspect" data-agent-region="inspect">
              <h2>Inspect</h2>
              <CellInspector coord={selectedCoord} material={selectedCell?.material ?? MATERIAL.Empty} state={selectedCell?.state ?? 0} />
              <EventHistoryPanel events={events} />
            </div>
            <div className="agartha-side-panel__group" aria-label="Simulation" data-agent-region="world">
              <h2>Simulation</h2>
              <TerrainSeedPanel
                onSelectSeed={selectTerrainSeed}
                seeds={TERRAIN_SEEDS}
                selectedSeedId={terrainSeedId}
              />
              <TimeControls
                isPlaying={isPlaying}
                onResetTime={() => {
                  resetTime();
                }}
                onStep={advanceTime}
                onTogglePlay={togglePlayback}
                tick={tick}
              />
            </div>
            <div className="agartha-side-panel__group" aria-label="Tools" data-agent-region="create">
              <h2>Tools</h2>
              <MaterialEditorPanel
                canRedo={redoStack.length > 0}
                canUndo={undoStack.length > 0}
                onCreatePaintSwatch={createPaintSwatch}
                onClear={resetDemo}
                onClearAllCells={clearAllCells}
                onRedo={redoEdit}
                onUndo={undoEdit}
                onUpdatePaintSwatch={updatePaintSwatch}
                onUpdateSettings={updateToolSettings}
                paintSwatches={paintSwatches}
                settings={toolSettings}
              />
              <ObjectLibraryPanel
                onCapture={captureObject}
                onSelectTemplate={selectObjectTemplate}
                onUpdateStampPattern={updateStampPattern}
                selectedId={toolSettings.objectId}
                selection={selection}
                stampRepeat={toolSettings.stampRepeat}
                stampStepX={toolSettings.stampStepX}
                stampStepY={toolSettings.stampStepY}
                templates={objectTemplates}
              />
            </div>
          </>
        ) : (
          <>
            <div className="agartha-side-panel__group" aria-label="Inspect" data-agent-region="inspect">
              <h2>Inspect</h2>
              <CellInspector coord={selectedCoord} material={selectedCell?.material ?? MATERIAL.Empty} state={selectedCell?.state ?? 0} />
              <EventHistoryPanel events={events} />
            </div>
            <div className="agartha-side-panel__group" aria-label="Simulation" data-agent-region="world">
              <h2>Simulation</h2>
              <TerrainSeedPanel
                onSelectSeed={selectTerrainSeed}
                seeds={TERRAIN_SEEDS}
                selectedSeedId={terrainSeedId}
              />
              <TimeControls
                isPlaying={isPlaying}
                onResetTime={() => {
                  resetTime();
                }}
                onStep={advanceTime}
                onTogglePlay={togglePlayback}
                tick={tick}
              />
            </div>
            <div className="agartha-side-panel__group" aria-label="Tools" data-agent-region="create">
              <h2>Tools</h2>
              <MaterialEditorPanel
                canRedo={redoStack.length > 0}
                canUndo={undoStack.length > 0}
                onCreatePaintSwatch={createPaintSwatch}
                onClear={resetDemo}
                onClearAllCells={clearAllCells}
                onRedo={redoEdit}
                onUndo={undoEdit}
                onUpdatePaintSwatch={updatePaintSwatch}
                onUpdateSettings={updateToolSettings}
                paintSwatches={paintSwatches}
                settings={toolSettings}
                showClearAllCells
              />
              <ObjectLibraryPanel
                onCapture={captureObject}
                onSelectTemplate={selectObjectTemplate}
                onUpdateStampPattern={updateStampPattern}
                selectedId={toolSettings.objectId}
                selection={selection}
                stampRepeat={toolSettings.stampRepeat}
                stampStepX={toolSettings.stampStepX}
                stampStepY={toolSettings.stampStepY}
                templates={objectTemplates}
              />
            </div>
          </>
        )}
      </aside>
    </main>
  );
}

function ModeSwitch({
  mode,
  onChangeMode,
}: {
  readonly mode: UIMode;
  readonly onChangeMode: (mode: UIMode) => void;
}) {
  return (
    <div className="mode-switch gradient-border gradient-border-to-r" role="radiogroup" aria-label="Interaction mode" data-agent-region="interaction-mode">
      <button aria-checked={mode === "human"} data-agent-id="mode-human" onClick={() => onChangeMode("human")} role="radio" type="button">
        Human
      </button>
      <button aria-checked={mode === "agent"} data-agent-id="mode-agent" onClick={() => onChangeMode("agent")} role="radio" type="button">
        Agent
      </button>
    </div>
  );
}

function AgentStateBridge({
  cells,
  collaborationContext,
  commands,
  latestEvent,
  mode,
  objects,
  selectedCoord,
  selectedMaterial,
  selection,
  tool,
  worldSource,
}: {
  readonly cells: number;
  readonly collaborationContext?: ServerCollaborationContext;
  readonly commands: readonly string[];
  readonly latestEvent?: DemoEvent;
  readonly mode: UIMode;
  readonly objects: number;
  readonly selectedCoord: string;
  readonly selectedMaterial: string;
  readonly selection?: CellSelection;
  readonly tool: string;
  readonly worldSource: WorldSourceState;
}) {
  const state = {
    app: "agartha-first-demo",
    commands,
    latestEvent: latestEvent
      ? {
          id: latestEvent.id,
          summary: latestEvent.summary,
          tick: latestEvent.tick,
        }
      : null,
    mode,
    objects,
    regions: ["board", "world-inspector", "automation", "create", "inspect", "world"],
    selectedCell: {
      coord: selectedCoord,
      material: selectedMaterial,
    },
    selection: selection ? { height: selection.height, origin: cellKey(selection.origin), width: selection.width } : null,
    source: {
      apiUrl: worldSource.apiUrl ?? null,
      chunkVersions: worldSource.chunkVersions ?? null,
      connection: worldSource.connection,
      mode: worldSource.mode,
      mutationAuthority: worldSource.mode === "server_backed" ? "server_api" : worldSource.mode === "convex_backed" ? "convex_api" : "browser_local_demo",
      status: worldSource.message,
    },
    collaboration: collaborationContext
      ? {
          areaId: collaborationContext.area.id,
          durableSummaries: collaborationContext.durableSummaries.map((summary) => ({
            id: summary.id,
            status: summary.provenance?.status ?? null,
            body: summary.body,
          })),
          latestMessage: collaborationContext.recentMessages.at(-1) ?? null,
          presentAgents: collaborationContext.presence
            .filter((agent) => agent.live)
            .map((agent) => ({ agentId: agent.agentId, displayName: agent.displayName ?? null })),
          presenceCount: collaborationContext.presence.filter((agent) => agent.live).length,
          projects: collaborationContext.projects.map((project) => ({
            id: project.id,
            title: project.title,
            version: project.version,
            latestEntry: project.entries.at(-1) ?? null,
          })),
          recommendedNextAction:
            collaborationContext.durableSummaries.length === 0 && collaborationContext.recentMessages.length > 0
              ? "collab summary"
              : "collab say",
          writeAuthority:
            worldSource.mode === "local_demo"
              ? "browser_local_only"
              : worldSource.mode === "server_backed"
              ? "cli_or_server_api_token"
              : "convex_api_token",
        }
      : null,
    tool,
    visibleCells: cells,
  };

  return (
    <script
      data-agent-id="agartha-agent-state"
      type="application/json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(state) }}
    />
  );
}

function CollaborationPanel({
  context,
  worldSource,
}: {
  readonly context?: ServerCollaborationContext;
  readonly worldSource: WorldSourceState;
}) {
  const livePresence = context?.presence.filter((agent) => agent.live) ?? [];
  const latestProject = context?.projects.at(-1);
  const latestSummary = context?.durableSummaries.at(-1);
  const latestMessages = context?.recentMessages.slice(-3) ?? [];
  const writeEnabled = worldSource.mode === "local_demo" ? false : worldSource.connection === "connected";

  return (
    <section
      className="inspector-panel collaboration-panel gradient-border gradient-border-to-br"
      aria-label="Spatial collaboration"
      data-agent-region="collaboration"
    >
      <h2>Collaboration</h2>
      <dl>
        <div>
          <dt>area</dt>
          <dd>{context?.area.id ?? "local demo"}</dd>
        </div>
        <div>
          <dt>presence</dt>
          <dd>{livePresence.length}</dd>
        </div>
        <div>
          <dt>writes</dt>
          <dd>{writeEnabled ? "api token" : "read only"}</dd>
        </div>
      </dl>
      <div className="collaboration-panel__section" aria-label="Present agents">
        {livePresence.length > 0 ? (
          livePresence.map((agent) => (
            <span className="collaboration-panel__pill" key={agent.agentId}>
              {agent.displayName ?? agent.agentId}
            </span>
          ))
        ) : (
          <p>No live agents nearby</p>
        )}
      </div>
      <div className="collaboration-panel__section" aria-label="Area project">
        <strong>{latestProject?.title ?? "No area project"}</strong>
        {latestProject?.entries.at(-1) ? <p>{latestProject.entries.at(-1)?.body}</p> : null}
      </div>
      <div className="collaboration-panel__section" aria-label="Durable summary">
        <strong>{latestSummary ? latestSummary.provenance?.status ?? "summary" : "No durable summary"}</strong>
        {latestSummary ? <p>{latestSummary.body}</p> : null}
      </div>
      <div className="collaboration-panel__section" aria-label="Recent local messages" role="log">
        {latestMessages.length > 0 ? (
          latestMessages.map((message) => (
            <p key={message.id}>
              <span>{message.authorAgentId}</span>: {message.body}
            </p>
          ))
        ) : (
          <p>No recent local messages</p>
        )}
      </div>
    </section>
  );
}

function AgentStatusPanel({
  cells,
  objects,
  selectedCoord,
  selection,
  tool,
}: {
  readonly cells: number;
  readonly objects: number;
  readonly selectedCoord: string;
  readonly selection?: CellSelection;
  readonly tool: string;
}) {
  return (
    <section className="inspector-panel agent-status-panel gradient-border gradient-border-to-br" aria-label="Agent status">
      <h2>Agent Status</h2>
      <dl>
        <div>
          <dt>tool</dt>
          <dd>{tool}</dd>
        </div>
        <div>
          <dt>selected</dt>
          <dd>{selectedCoord}</dd>
        </div>
        <div>
          <dt>selection</dt>
          <dd>{selection ? `${selection.width}x${selection.height}` : "none"}</dd>
        </div>
        <div>
          <dt>cells</dt>
          <dd>{cells}</dd>
        </div>
        <div>
          <dt>objects</dt>
          <dd>{objects}</dd>
        </div>
      </dl>
    </section>
  );
}

function materialLabel(material: MaterialId) {
  return MATERIAL_NAME[material];
}

function editSummary(affected: number, coord: WorldCoord, material: MaterialId) {
  const target = material === MATERIAL.Empty ? "clear" : materialLabel(material);
  return `${target} ${affected} cell${affected === 1 ? "" : "s"} near ${cellKey(coord)}`;
}

function toolLabel(mode: MaterialToolSettings["mode"]) {
  if (mode === "shape") return "Shape";
  return mode[0].toUpperCase() + mode.slice(1);
}

function convexEditLabel(mode: MaterialToolSettings["mode"], gesture: "shape" | "stamp" | "tool" | "stroke") {
  if (gesture === "stamp") return "Stamp";
  return `${toolLabel(mode)} ${gesture}`;
}

function changedCoords(previousCells: readonly DemoCell[], nextCells: readonly DemoCell[]): WorldCoord[] {
  const previous = new Map(previousCells.map((cell) => [cell.id, cell]));
  const next = new Map(nextCells.map((cell) => [cell.id, cell]));
  const changed: WorldCoord[] = [];

  for (const cell of nextCells) {
    const current = previous.get(cell.id);
    if (
      !current ||
      current.material !== cell.material ||
      current.state !== cell.state ||
      current.variant !== cell.variant ||
      current.flags !== cell.flags
    ) {
      changed.push(cell.coord);
    }
  }

  for (const cell of previousCells) {
    if (!next.has(cell.id)) changed.push(cell.coord);
  }

  return changed;
}

function mergeCells(baseCells: readonly DemoCell[], overlayCells: readonly DemoCell[]): DemoCell[] {
  const merged = new Map(baseCells.map((cell) => [cell.id, cell]));
  for (const cell of overlayCells) {
    if (cell.material === MATERIAL.Empty) {
      merged.delete(cell.id);
    } else {
      merged.set(cell.id, cell);
    }
  }
  return Array.from(merged.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function mergePendingCells(baseCells: readonly DemoCell[], overlayCells: readonly DemoCell[]): DemoCell[] {
  const merged = new Map(baseCells.map((cell) => [cell.id, cell]));
  for (const cell of overlayCells) merged.set(cell.id, cell);
  return Array.from(merged.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function mergeObjectTemplates(primary: readonly CellObjectTemplate[], secondary: readonly CellObjectTemplate[]): CellObjectTemplate[] {
  const merged = new Map<string, CellObjectTemplate>();
  for (const template of secondary) merged.set(template.id, template);
  for (const template of primary) merged.set(template.id, template);
  return Array.from(merged.values()).slice(0, 24);
}

function snapshotHasCell(snapshotCells: readonly DemoCell[], pendingCell: DemoCell) {
  if (pendingCell.material === MATERIAL.Empty) return !snapshotCells.some((cell) => cell.id === pendingCell.id);
  return snapshotCells.some((cell) => sameCell(cell, pendingCell));
}

function sameCell(a: DemoCell, b: DemoCell) {
  return (
    a.id === b.id &&
    a.material === b.material &&
    a.state === b.state &&
    a.variant === b.variant &&
    a.flags === b.flags
  );
}

function paintLabel(id: number) {
  return DEFAULT_PAINT_SWATCHES.find((swatch) => swatch.id === id)?.label ?? `Paint ${id + 1}`;
}

function buildAgentCommandSuggestions(coord: WorldCoord, paintVariant: number) {
  const [x, y] = cellKey(coord).split(":");
  const paintSlot = Math.max(1, Math.min(DEFAULT_PAINT_SWATCHES.length, paintVariant + 1));
  return [`masterpiece phoenix ${x} ${y}`, `masterpiece lotus ${x} ${y}`, `paint ${paintSlot} ${x} ${y} 3`, `material plant ${x} ${y} 3`];
}

type AgentCommandResult =
  | {
      readonly kind: "ok";
      readonly summary: string;
      readonly cells?: DemoCell[];
      readonly coord?: WorldCoord;
      readonly paintColor?: { readonly id: number; readonly color: string };
      readonly paintColors?: ReadonlyArray<{ readonly id: number; readonly color: string }>;
      readonly settings?: MaterialToolSettings;
      readonly template?: CellObjectTemplate;
    }
  | { readonly kind: "error"; readonly message: string };

function executeAgentCommand(
  command: string,
  cells: readonly DemoCell[],
  baseSettings: MaterialToolSettings,
  templates: readonly CellObjectTemplate[],
): AgentCommandResult {
  const parts = command.trim().split(/\s+/);
  const verb = parts[0]?.toLowerCase();

  if (!verb) return { kind: "error", message: "Empty command" };

  if (verb === "color") {
    const slot = parsePaintSlot(parts[1]);
    const color = parts[2]?.toLowerCase();
    if (slot === undefined || !color || !/^#[0-9a-f]{6}$/i.test(color)) {
      return { kind: "error", message: "Use: color 4 #ff44aa" };
    }
    return {
      kind: "ok",
      paintColor: { id: slot, color },
      summary: `Agent command: updated ${paintLabel(slot)} to ${color}`,
    };
  }

  if (verb === "masterpiece" || verb === "art") {
    const motif = parts[1]?.toLowerCase() ?? "phoenix";
    const x = Number(parts[2] ?? 94);
    const y = Number(parts[3] ?? 84);
    const scale = Number(parts[4] ?? 1);
    if ((motif !== "phoenix" && motif !== "lotus") || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(scale)) {
      return { kind: "error", message: "Use: masterpiece phoenix 94 84 1 or masterpiece lotus 94 84 1" };
    }
    return renderMasterpiece(cells, motif, Math.round(x), Math.round(y), scale, baseSettings);
  }

  if (verb === "flower" || (verb === "build" && parts[1]?.toLowerCase() === "flower")) {
    const offset = verb === "build" ? 1 : 0;
    const x = Number(parts[1 + offset]);
    const y = Number(parts[2 + offset]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { kind: "error", message: "Use: flower 70 52" };
    return buildFlower(cells, Math.round(x), Math.round(y), baseSettings);
  }

  if (verb === "garden" || (verb === "build" && parts[1]?.toLowerCase() === "garden")) {
    const offset = verb === "build" ? 1 : 0;
    const x = Number(parts[1 + offset]);
    const y = Number(parts[2 + offset]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { kind: "error", message: "Use: garden 66 56" };
    return buildGarden(cells, Math.round(x), Math.round(y), baseSettings);
  }

  if (verb === "paint" || verb === "material") {
    const materialToken = parts[1]?.toLowerCase();
    const x = Number(parts[2]);
    const y = Number(parts[3]);
    const size = Number(parts[4] ?? 3);
    const material = verb === "paint" ? MATERIAL.Paint : materialFromToken(materialToken);
    const paintVariant = verb === "paint" ? parsePaintSlot(materialToken) ?? baseSettings.paintVariant : baseSettings.paintVariant;

    if (material === undefined || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size)) {
      return { kind: "error", message: "Use: paint 4 70 52 5 or material plant 70 52 4" };
    }

    const settings: MaterialToolSettings = {
      ...baseSettings,
      brushSize: Math.max(1, Math.min(10, Math.round(size))),
      shapeMode: "circle",
      material,
      mode: "shape",
      paintVariant,
    };
    const coord = toWorldCoord(Math.round(x), Math.round(y));
    const result = applyMaterialTool(cells, coord, settings);
    return {
      cells: result.cells,
      coord,
      kind: "ok",
      settings,
      summary: `Agent command: ${verb} ${result.affected} cells near ${cellKey(coord)}`,
    };
  }

  if (verb === "object") {
    const action = parts[1]?.toLowerCase();

    if (action === "save") {
      const label = parts[2];
      const x = Number(parts[3]);
      const y = Number(parts[4]);
      const width = Number(parts[5]);
      const height = Number(parts[6]);
      if (!label || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
        return { kind: "error", message: "Use: object save house 60 42 18 14" };
      }
      const template = captureCellObject(cells, label, toWorldCoord(Math.round(x), Math.round(y)), width, height);
      return {
        kind: "ok",
        summary: `Agent command: saved object ${template.label} with ${template.samples.length} cells`,
        template,
      };
    }

    if (action === "stamp") {
      const id = parts[2]?.toLowerCase();
      const x = Number(parts[3]);
      const y = Number(parts[4]);
      const repeat = Number(parts[5] ?? 1);
      const stepX = Number(parts[6] ?? 0);
      const stepY = Number(parts[7] ?? 0);
      const template = templates.find((candidate) => candidate.id === id || candidate.label.toLowerCase() === id);
      if (
        !template ||
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(repeat) ||
        !Number.isFinite(stepX) ||
        !Number.isFinite(stepY)
      ) {
        return { kind: "error", message: "Use: object stamp house 90 52 or object stamp house 90 52 4 20 0" };
      }
      const coord = toWorldCoord(Math.round(x), Math.round(y));
      const result = stampCellObjectPattern(cells, template, coord, { repeat, stepX, stepY });
      return {
        cells: result.cells,
        coord,
        kind: "ok",
        summary:
          result.placements === 1
            ? `Agent command: stamped object ${template.label} with ${result.affected} cells near ${cellKey(coord)}`
            : `Agent command: stamped ${result.placements} ${template.label} objects with ${result.affected} cells from ${cellKey(coord)}`,
      };
    }
  }

  return { kind: "error", message: "Unknown command" };
}

type ArtMotif = "phoenix" | "lotus";

type ArtBrush = {
  readonly material: MaterialId;
  readonly state?: number;
  readonly variant?: number;
};

const MASTERPIECE_PALETTE = [
  { id: 0, color: "#45a7ff" },
  { id: 1, color: "#f05cff" },
  { id: 2, color: "#ffd35a" },
  { id: 3, color: "#53e6b1" },
];

function renderMasterpiece(
  cells: readonly DemoCell[],
  motif: ArtMotif,
  x: number,
  y: number,
  scale: number,
  baseSettings: MaterialToolSettings,
): AgentCommandResult {
  const safeScale = Math.max(0.75, Math.min(1.35, scale));
  const next = new Map(cells.map((cell) => [cell.id, cell]));
  const before = new Map(cells.map((cell) => [cell.id, cellSignature(cell)]));
  clearArtworkStage(next, x, y, Math.round(74 * safeScale), Math.round(68 * safeScale));

  if (motif === "phoenix") {
    renderPhoenixMasterpiece(next, x, y, safeScale);
  } else {
    renderLotusMasterpiece(next, x, y, safeScale);
  }

  return {
    cells: Array.from(next.values()).sort(sortDemoCells),
    coord: toWorldCoord(x, y),
    kind: "ok",
    paintColors: MASTERPIECE_PALETTE,
    settings: {
      ...baseSettings,
      material: MATERIAL.Paint,
      mode: "shape",
      paintVariant: motif === "phoenix" ? 2 : 1,
      shapeMode: "circle",
    },
    summary: `Agent command: rendered ${motif} masterpiece with ${changedCellCount(before, next)} cells near ${x}:${y}`,
  };
}

function renderPhoenixMasterpiece(cells: Map<string, DemoCell>, x: number, y: number, scale: number) {
  const s = scale;
  const px = (offset: number) => x + offset * s;
  const py = (offset: number) => y + offset * s;

  scatterArtStars(cells, x, y, s);

  paintEllipse(cells, px(0), py(-49), 23 * s, 14 * s, { material: MATERIAL.Paint, variant: 2 });
  paintEllipse(cells, px(0), py(-49), 14 * s, 8 * s, { material: MATERIAL.Fire, state: 0 });
  paintEllipse(cells, px(0), py(-49), 5 * s, 3 * s, { material: MATERIAL.Empty });
  for (const ray of [-24, -15, -7, 7, 15, 24]) {
    paintRotatedEllipse(cells, px(ray), py(-49 + Math.abs(ray) * 0.12), 8 * s, 2 * s, ray > 0 ? 0.35 : -0.35, {
      material: MATERIAL.Paint,
      variant: 2,
    });
  }

  for (const side of [-1, 1]) {
    const angle = side === -1 ? -0.72 : 0.72;
    const feathers = [
      { ox: 15, oy: -18, rx: 9, ry: 28, variant: 0 },
      { ox: 26, oy: -12, rx: 10, ry: 32, variant: 1 },
      { ox: 36, oy: -4, rx: 11, ry: 35, variant: 1 },
      { ox: 45, oy: 8, rx: 10, ry: 32, variant: 3 },
      { ox: 51, oy: 21, rx: 8, ry: 25, variant: 0 },
    ];

    for (const feather of feathers) {
      paintRotatedEllipse(cells, px(side * feather.ox), py(feather.oy), feather.rx * s, feather.ry * s, angle, {
        material: MATERIAL.Paint,
        variant: feather.variant,
      });
      paintRotatedEllipse(cells, px(side * (feather.ox + 3)), py(feather.oy + 2), Math.max(2, feather.rx - 5) * s, feather.ry * 0.48 * s, angle, {
        material: MATERIAL.Empty,
      });
      paintRotatedEllipse(cells, px(side * (feather.ox + 1)), py(feather.oy - feather.ry * 0.38), 4 * s, 6 * s, angle, {
        material: MATERIAL.Paint,
        variant: 2,
      });
    }

    drawArtLine(cells, px(side * 7), py(-10), px(side * 54), py(23), 1.4 * s, { material: MATERIAL.Water });
    paintEllipse(cells, px(side * 58), py(31), 4 * s, 4 * s, { material: MATERIAL.Fire });
  }

  paintEllipse(cells, px(0), py(-24), 7 * s, 7 * s, { material: MATERIAL.Paint, variant: 2 });
  paintEllipse(cells, px(0), py(-28), 3 * s, 10 * s, { material: MATERIAL.Fire });
  paintEllipse(cells, px(7), py(-23), 5 * s, 2 * s, { material: MATERIAL.Fire });
  paintEllipse(cells, px(-3), py(-25), 1.5 * s, 1.5 * s, { material: MATERIAL.Empty });

  paintEllipse(cells, px(0), py(-5), 12 * s, 25 * s, { material: MATERIAL.Paint, variant: 2 });
  paintEllipse(cells, px(0), py(-6), 7 * s, 16 * s, { material: MATERIAL.Fire });
  paintEllipse(cells, px(0), py(8), 8 * s, 17 * s, { material: MATERIAL.Paint, variant: 3 });
  paintEllipse(cells, px(0), py(1), 4 * s, 8 * s, { material: MATERIAL.Paint, variant: 1 });

  for (const offset of [-18, -9, 0, 9, 18]) {
    const variant = offset === 0 ? 2 : Math.abs(offset) === 9 ? 3 : 0;
    paintRotatedEllipse(cells, px(offset), py(34), 5 * s, 32 * s, offset * 0.035, { material: MATERIAL.Paint, variant });
    paintEllipse(cells, px(offset), py(60), 5 * s, 4 * s, { material: Math.abs(offset) === 18 ? MATERIAL.Fire : MATERIAL.Water });
  }

  paintEllipse(cells, px(0), py(59), 35 * s, 8 * s, { material: MATERIAL.Water });
  paintEllipse(cells, px(0), py(55), 20 * s, 5 * s, { material: MATERIAL.Paint, variant: 0 });
  paintEllipse(cells, px(-22), py(60), 5 * s, 5 * s, { material: MATERIAL.Paint, variant: 2 });
  paintEllipse(cells, px(22), py(60), 5 * s, 5 * s, { material: MATERIAL.Paint, variant: 2 });
}

function renderLotusMasterpiece(cells: Map<string, DemoCell>, x: number, y: number, scale: number) {
  const s = scale;
  const px = (offset: number) => x + offset * s;
  const py = (offset: number) => y + offset * s;

  scatterArtStars(cells, x, y, s);
  paintEllipse(cells, px(0), py(-38), 22 * s, 22 * s, { material: MATERIAL.Water });
  paintEllipse(cells, px(6), py(-40), 20 * s, 20 * s, { material: MATERIAL.Empty });
  paintEllipse(cells, px(-8), py(-36), 5 * s, 5 * s, { material: MATERIAL.Paint, variant: 0 });

  for (const side of [-1, 1]) {
    paintRotatedEllipse(cells, px(side * 31), py(-2), 12 * s, 34 * s, side * 0.72, { material: MATERIAL.Paint, variant: 1 });
    paintRotatedEllipse(cells, px(side * 20), py(3), 10 * s, 29 * s, side * 0.4, { material: MATERIAL.Paint, variant: 0 });
    paintRotatedEllipse(cells, px(side * 36), py(20), 7 * s, 20 * s, side * 0.95, { material: MATERIAL.Paint, variant: 3 });
  }

  paintRotatedEllipse(cells, px(0), py(-8), 13 * s, 33 * s, 0, { material: MATERIAL.Paint, variant: 1 });
  paintRotatedEllipse(cells, px(-10), py(8), 12 * s, 27 * s, -0.35, { material: MATERIAL.Paint, variant: 1 });
  paintRotatedEllipse(cells, px(10), py(8), 12 * s, 27 * s, 0.35, { material: MATERIAL.Paint, variant: 1 });
  paintEllipse(cells, px(0), py(13), 12 * s, 10 * s, { material: MATERIAL.Paint, variant: 2 });
  paintEllipse(cells, px(0), py(13), 5 * s, 5 * s, { material: MATERIAL.Fire });

  drawArtLine(cells, px(0), py(20), px(0), py(55), 4 * s, { material: MATERIAL.Plant });
  paintRotatedEllipse(cells, px(-14), py(40), 9 * s, 22 * s, -0.85, { material: MATERIAL.Plant });
  paintRotatedEllipse(cells, px(14), py(44), 9 * s, 22 * s, 0.85, { material: MATERIAL.Plant });
  paintEllipse(cells, px(0), py(62), 38 * s, 8 * s, { material: MATERIAL.Water });
  paintEllipse(cells, px(-18), py(62), 8 * s, 5 * s, { material: MATERIAL.Paint, variant: 2 });
  paintEllipse(cells, px(18), py(62), 8 * s, 5 * s, { material: MATERIAL.Paint, variant: 2 });
}

function clearArtworkStage(cells: Map<string, DemoCell>, centerX: number, centerY: number, halfWidth: number, halfHeight: number) {
  for (let y = centerY - halfHeight; y <= centerY + halfHeight; y += 1) {
    for (let x = centerX - halfWidth; x <= centerX + halfWidth; x += 1) {
      cells.delete(cellKey(toWorldCoord(x, y)));
    }
  }
}

function paintEllipse(cells: Map<string, DemoCell>, centerX: number, centerY: number, radiusX: number, radiusY: number, brush: ArtBrush) {
  paintRotatedEllipse(cells, centerX, centerY, radiusX, radiusY, 0, brush);
}

function paintRotatedEllipse(
  cells: Map<string, DemoCell>,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  rotation: number,
  brush: ArtBrush,
) {
  const bound = Math.ceil(Math.max(radiusX, radiusY) + 2);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  for (let y = Math.floor(centerY - bound); y <= Math.ceil(centerY + bound); y += 1) {
    for (let x = Math.floor(centerX - bound); x <= Math.ceil(centerX + bound); x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      const localX = dx * cos + dy * sin;
      const localY = -dx * sin + dy * cos;
      if ((localX * localX) / (radiusX * radiusX) + (localY * localY) / (radiusY * radiusY) <= 1) {
        setArtCell(cells, x, y, brush);
      }
    }
  }
}

function drawArtLine(
  cells: Map<string, DemoCell>,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  width: number,
  brush: ArtBrush,
) {
  const steps = Math.max(1, Math.ceil(Math.hypot(endX - startX, endY - startY)));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    paintEllipse(cells, startX + (endX - startX) * t, startY + (endY - startY) * t, width, width, brush);
  }
}

function scatterArtStars(cells: Map<string, DemoCell>, centerX: number, centerY: number, scale: number) {
  const stars = [
    [-55, -36, 0],
    [-48, -20, 2],
    [-57, 6, 3],
    [-51, 35, 0],
    [-34, 54, 1],
    [42, -35, 2],
    [56, -13, 3],
    [60, 16, 0],
    [48, 43, 1],
    [33, 58, 2],
  ];
  for (const [offsetX, offsetY, variant] of stars) {
    paintEllipse(cells, centerX + offsetX * scale, centerY + offsetY * scale, 2.5 * scale, 2.5 * scale, {
      material: MATERIAL.Paint,
      variant,
    });
    paintEllipse(cells, centerX + offsetX * scale, centerY + offsetY * scale, 0.8 * scale, 4 * scale, {
      material: variant === 2 ? MATERIAL.Fire : MATERIAL.Water,
    });
    paintEllipse(cells, centerX + offsetX * scale, centerY + offsetY * scale, 4 * scale, 0.8 * scale, {
      material: variant === 2 ? MATERIAL.Fire : MATERIAL.Water,
    });
  }
}

function setArtCell(cells: Map<string, DemoCell>, x: number, y: number, brush: ArtBrush) {
  const coord = toWorldCoord(Math.round(x), Math.round(y));
  const key = cellKey(coord);
  if (brush.material === MATERIAL.Empty) {
    cells.delete(key);
    return;
  }
  cells.set(key, demoCell(Math.round(x), Math.round(y), brush.material, brush.state ?? 0, brush.variant ?? 0));
}

function cellSignature(cell: DemoCell) {
  return `${cell.material}:${cell.variant}:${cell.state}:${cell.flags}`;
}

function changedCellCount(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, DemoCell>) {
  let changed = 0;
  for (const [id, cell] of after) {
    if (before.get(id) !== cellSignature(cell)) changed += 1;
  }
  for (const id of before.keys()) {
    if (!after.has(id)) changed += 1;
  }
  return changed;
}

function sortDemoCells(a: DemoCell, b: DemoCell) {
  const absoluteA = absoluteCoord(a.coord);
  const absoluteB = absoluteCoord(b.coord);
  return absoluteA.y - absoluteB.y || absoluteA.x - absoluteB.x;
}

function buildFlower(cells: readonly DemoCell[], x: number, y: number, baseSettings: MaterialToolSettings): AgentCommandResult {
  const coord = toWorldCoord(x, y);
  let nextCells = Array.from(cells);
  let affected = 0;

  const strokes: Array<{ readonly x: number; readonly y: number; readonly material: MaterialId; readonly size: number; readonly paintVariant?: number }> = [
    { x, y, material: MATERIAL.Paint, size: 1, paintVariant: 2 },
    { x: x - 2, y, material: MATERIAL.Paint, size: 2, paintVariant: 3 },
    { x: x + 2, y, material: MATERIAL.Paint, size: 2, paintVariant: 3 },
    { x, y: y - 2, material: MATERIAL.Paint, size: 2, paintVariant: 3 },
    { x, y: y + 2, material: MATERIAL.Paint, size: 2, paintVariant: 3 },
    { x, y: y + 5, material: MATERIAL.Plant, size: 1 },
    { x, y: y + 7, material: MATERIAL.Plant, size: 1 },
    { x: x - 1, y: y + 6, material: MATERIAL.Plant, size: 1 },
    { x: x + 1, y: y + 6, material: MATERIAL.Plant, size: 1 },
  ];

  for (const stroke of strokes) {
    const result = applyMaterialTool(nextCells, toWorldCoord(stroke.x, stroke.y), {
      ...baseSettings,
      brushSize: stroke.size,
      hardness: 100,
      material: stroke.material,
      mode: "shape",
      opacity: 100,
      paintVariant: stroke.paintVariant ?? baseSettings.paintVariant,
      shapeMode: "circle",
    });
    nextCells = result.cells;
    affected += result.affected;
  }

  return {
    cells: nextCells,
    coord,
    kind: "ok",
    summary: `Agent command: built flower with ${affected} cells near ${cellKey(coord)}`,
  };
}

function buildGarden(cells: readonly DemoCell[], x: number, y: number, baseSettings: MaterialToolSettings): AgentCommandResult {
  const coord = toWorldCoord(x, y);
  let nextCells = Array.from(cells);
  let affected = 0;

  const strokes: Array<{ readonly x: number; readonly y: number; readonly material: MaterialId; readonly size: number; readonly paintVariant?: number }> = [
    { x: x - 6, y, material: MATERIAL.Water, size: 2 },
    { x: x - 2, y: y + 1, material: MATERIAL.Water, size: 2 },
    { x: x + 2, y, material: MATERIAL.Water, size: 2 },
    { x: x + 6, y: y - 1, material: MATERIAL.Water, size: 2 },
    { x: x - 5, y: y - 3, material: MATERIAL.Plant, size: 3 },
    { x: x + 5, y: y + 3, material: MATERIAL.Plant, size: 3 },
    { x, y: y - 5, material: MATERIAL.Paint, size: 2, paintVariant: 1 },
    { x: x + 7, y: y - 5, material: MATERIAL.Paint, size: 1, paintVariant: 2 },
  ];

  for (const stroke of strokes) {
    const result = applyMaterialTool(nextCells, toWorldCoord(stroke.x, stroke.y), {
      ...baseSettings,
      brushSize: stroke.size,
      hardness: 100,
      material: stroke.material,
      mode: "shape",
      opacity: 100,
      paintVariant: stroke.paintVariant ?? baseSettings.paintVariant,
      shapeMode: "circle",
    });
    nextCells = result.cells;
    affected += result.affected;
  }

  return {
    cells: nextCells,
    coord,
    kind: "ok",
    summary: `Agent command: built garden with ${affected} cells near ${cellKey(coord)}`,
  };
}

function parsePaintSlot(token: string | undefined) {
  const parsed = Number(token?.replace(/^paint/i, ""));
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > DEFAULT_PAINT_SWATCHES.length) return undefined;
  return parsed - 1;
}

function materialFromToken(token: string | undefined): MaterialId | undefined {
  if (!token) return undefined;
  if (token === "paint") return MATERIAL.Paint;
  if (token === "stone") return MATERIAL.Stone;
  if (token === "water") return MATERIAL.Water;
  if (token === "fire") return MATERIAL.Fire;
  if (token === "plant") return MATERIAL.Plant;
  if (token === "empty") return MATERIAL.Empty;
  return undefined;
}

function upsertTemplate(templates: readonly CellObjectTemplate[], template: CellObjectTemplate) {
  return [template, ...templates.filter((candidate) => candidate.id !== template.id)].slice(0, 24);
}

declare global {
  interface Window {
    agarthaAgent?: {
      readonly commands: readonly string[];
      readonly run: (command: string) => string;
    };
    agarthaRoot?: Root;
  }
}

const root = document.getElementById("root");

if (root) {
  window.agarthaRoot ??= createRoot(root);
  window.agarthaRoot.render(
    <React.StrictMode>
      <RootApp />
    </React.StrictMode>,
  );
}

function RootApp() {
  return (
    <AgarthaConvexProvider url={CONVEX_URL}>
      <ConvexBackedApp />
    </AgarthaConvexProvider>
  );
}

function ConvexBackedApp() {
  const convexSnapshot = CONVEX_URL ? useConvexWorldSnapshot() : undefined;
  const convexObjectTemplates = CONVEX_URL ? useConvexObjectTemplates() : undefined;
  const convexAct = CONVEX_URL ? useConvexAct() : undefined;
  const convexSaveObjectTemplate = CONVEX_URL ? useConvexSaveObjectTemplate() : undefined;
  const convexPaintBrowserCells = CONVEX_URL ? useConvexPaintBrowserCells() : undefined;
  const convexClearAllCells = CONVEX_URL ? useConvexClearAllCells() : undefined;
  const convexStepWorld = CONVEX_URL ? useConvexStepWorld() : undefined;
  const convexResetWorldTime = CONVEX_URL ? useConvexResetWorldTime() : undefined;
  return (
    <App
      convexAct={convexAct}
      convexClearAllCells={convexClearAllCells}
      convexObjectTemplates={convexObjectTemplates}
      convexPaintBrowserCells={convexPaintBrowserCells}
      convexResetWorldTime={convexResetWorldTime}
      convexSaveObjectTemplate={convexSaveObjectTemplate}
      convexSnapshot={convexSnapshot}
      convexStepWorld={convexStepWorld}
    />
  );
}
