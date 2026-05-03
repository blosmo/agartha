import React, { type ReactNode } from "react";
import { ConvexProvider as ReactConvexProvider, ConvexReactClient } from "convex/react";

let convexClient: ConvexReactClient | undefined;

export function readConvexUrl(env: Record<string, string | boolean | undefined>): string | undefined {
  const value = env.VITE_CONVEX_URL;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function getConvexClient(url: string): ConvexReactClient {
  convexClient ??= new ConvexReactClient(url);
  return convexClient;
}

export function AgarthaConvexProvider({ url, children }: { readonly url?: string; readonly children: ReactNode }) {
  if (!url) return <>{children}</>;
  return <ReactConvexProvider client={getConvexClient(url)}>{children}</ReactConvexProvider>;
}
