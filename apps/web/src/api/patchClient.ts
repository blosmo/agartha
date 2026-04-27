import type { ChunkCoord } from "@agartha/protocol/world";
import type { ChunkSnapshot, PatchEnvelope } from "@agartha/protocol/patches";

import { ChunkTextureCache, type PatchApplyResult } from "../board/chunkTextureCache";

export interface SubscriptionState {
  readonly center: ChunkCoord;
  readonly radiusChunks: number;
  readonly subscribedChunks: readonly ChunkCoord[];
}

export class PatchClientState {
  readonly cache = new ChunkTextureCache();
  private subscription: SubscriptionState | undefined;
  readonly recoveryRequests: ChunkCoord[] = [];

  subscribe(center: ChunkCoord, radiusChunks: number): SubscriptionState {
    const subscribedChunks: ChunkCoord[] = [];
    for (let y = center.y - radiusChunks; y <= center.y + radiusChunks; y += 1) {
      for (let x = center.x - radiusChunks; x <= center.x + radiusChunks; x += 1) {
        subscribedChunks.push({ x, y });
      }
    }

    this.subscription = { center, radiusChunks, subscribedChunks };
    this.cache.releaseOutside(subscribedChunks);
    return this.subscription;
  }

  applySnapshot(snapshot: ChunkSnapshot) {
    this.cache.applySnapshot(snapshot);
  }

  applyPatch(patch: PatchEnvelope): PatchApplyResult {
    const result = this.cache.applyPatch(patch);
    if (!result.ok) {
      this.recoveryRequests.push(result.recoveryChunk);
    }
    return result;
  }

  currentSubscription(): SubscriptionState | undefined {
    return this.subscription;
  }
}
