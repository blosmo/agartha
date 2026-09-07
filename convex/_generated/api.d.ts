/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions from "../actions.js";
import type * as admin from "../admin.js";
import type * as chunks from "../chunks.js";
import type * as cloud_common from "../cloud/common.js";
import type * as cloud_http from "../cloud/http.js";
import type * as cloud_modelUpload from "../cloud/modelUpload.js";
import type * as cloud_models from "../cloud/models.js";
import type * as cloud_proposalHelpers from "../cloud/proposalHelpers.js";
import type * as cloud_proposalPreview from "../cloud/proposalPreview.js";
import type * as cloud_proposalRoutes from "../cloud/proposalRoutes.js";
import type * as cloud_proposalSchema from "../cloud/proposalSchema.js";
import type * as cloud_proposals from "../cloud/proposals.js";
import type * as cloud_read from "../cloud/read.js";
import type * as cloud_session from "../cloud/session.js";
import type * as cloud_write from "../cloud/write.js";
import type * as collaboration from "../collaboration.js";
import type * as crons from "../crons.js";
import type * as events from "../events.js";
import type * as http from "../http.js";
import type * as legacyGate from "../legacyGate.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_collaboration from "../lib/collaboration.js";
import type * as lib_coords from "../lib/coords.js";
import type * as lib_protocol from "../lib/protocol.js";
import type * as lib_validation from "../lib/validation.js";
import type * as objects from "../objects.js";
import type * as scene_authority from "../scene/authority.js";
import type * as scene_http from "../scene/http.js";
import type * as scene_library from "../scene/library.js";
import type * as scene_maintenance from "../scene/maintenance.js";
import type * as scene_model from "../scene/model.js";
import type * as scene_renderBudget from "../scene/renderBudget.js";
import type * as seed from "../seed.js";
import type * as worlds from "../worlds.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  actions: typeof actions;
  admin: typeof admin;
  chunks: typeof chunks;
  "cloud/common": typeof cloud_common;
  "cloud/http": typeof cloud_http;
  "cloud/modelUpload": typeof cloud_modelUpload;
  "cloud/models": typeof cloud_models;
  "cloud/proposalHelpers": typeof cloud_proposalHelpers;
  "cloud/proposalPreview": typeof cloud_proposalPreview;
  "cloud/proposalRoutes": typeof cloud_proposalRoutes;
  "cloud/proposalSchema": typeof cloud_proposalSchema;
  "cloud/proposals": typeof cloud_proposals;
  "cloud/read": typeof cloud_read;
  "cloud/session": typeof cloud_session;
  "cloud/write": typeof cloud_write;
  collaboration: typeof collaboration;
  crons: typeof crons;
  events: typeof events;
  http: typeof http;
  legacyGate: typeof legacyGate;
  "lib/auth": typeof lib_auth;
  "lib/collaboration": typeof lib_collaboration;
  "lib/coords": typeof lib_coords;
  "lib/protocol": typeof lib_protocol;
  "lib/validation": typeof lib_validation;
  objects: typeof objects;
  "scene/authority": typeof scene_authority;
  "scene/http": typeof scene_http;
  "scene/library": typeof scene_library;
  "scene/maintenance": typeof scene_maintenance;
  "scene/model": typeof scene_model;
  "scene/renderBudget": typeof scene_renderBudget;
  seed: typeof seed;
  worlds: typeof worlds;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
