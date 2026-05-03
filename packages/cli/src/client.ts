import type { ActionEnvelope, ActionResult, AgentPerception } from "@agartha/protocol/actions";
import type { CollaborationEnvelope, CollaborationResponseEnvelope } from "@agartha/protocol/collaboration";
import type { ChunkSnapshot } from "@agartha/protocol/patches";
import type { ChunkCoord } from "@agartha/protocol/world";

export interface CostQuote {
  readonly quoteId: string;
  readonly cost: number;
  readonly expectedChunkVersion?: number;
}

export interface AdminEnergyResponse {
  readonly agentId: string;
  readonly worldEnergy: {
    readonly current: number;
    readonly cap: number;
    readonly regeneratesEveryTicks: number;
    readonly nextRegenerationTick: number;
  };
}

export interface ApiErrorBody {
  readonly reason: string;
  readonly message: string;
  readonly status?: number;
}

export class AgarthaApiError extends Error {
  constructor(readonly body: ApiErrorBody) {
    super(body.message);
  }
}

export class AgarthaClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly options: { readonly backend?: "rust" | "convex"; readonly agentId?: string } = {},
  ) {}

  observe() {
    const query = this.options.backend === "convex" && this.options.agentId ? `?agentId=${encodeURIComponent(this.options.agentId)}` : "";
    return this.request<AgentPerception>(`/observe${query}`, { method: "GET" });
  }

  isConvexBackend() {
    return this.options.backend === "convex";
  }

  quote(envelope: ActionEnvelope) {
    return this.request<CostQuote>("/quote", { method: "POST", body: envelope });
  }

  act(envelope: ActionEnvelope) {
    return this.request<ActionResult>("/act", { method: "POST", body: envelope });
  }

  collaborate(envelope: CollaborationEnvelope) {
    return this.request<CollaborationResponseEnvelope>("/collaboration", { method: "POST", body: envelope });
  }

  adminRefillEnergy(agentId: string, amount?: number) {
    return this.request<AdminEnergyResponse>("/admin/energy/refill", {
      method: "POST",
      body: { agentId, amount },
    });
  }

  chunk(chunk: ChunkCoord) {
    return this.request<ChunkSnapshot>(`/chunks/${chunk.x}/${chunk.y}`, { method: "GET" });
  }

  events(limit?: number) {
    const query = limit === undefined ? "" : `?limit=${limit}`;
    return this.request<unknown[]>(`/events${query}`, { method: "GET" });
  }

  watch(
    request: WatchRequest,
    handlers: {
      readonly onMessage: (message: unknown) => void;
      readonly onError: (error: Error) => void;
      readonly onClose: () => void;
    },
  ): WebSocket {
    if (this.options.backend === "convex") return this.pollWatch(handlers) as unknown as WebSocket;
    const socket = new WebSocket(this.websocketUrl("/ws"));
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ chunk: request.chunk, radiusChunks: request.radiusChunks, token: this.token }));
    });
    socket.addEventListener("message", (event) => {
      try {
        handlers.onMessage(JSON.parse(String(event.data)));
      } catch (error) {
        handlers.onError(error instanceof Error ? error : new Error("Invalid WebSocket message"));
      }
    });
    socket.addEventListener("error", () => handlers.onError(new Error("WebSocket error")));
    socket.addEventListener("close", () => handlers.onClose());
    return socket;
  }

  private async request<TResponse>(
    path: string,
    init: { readonly method: "GET" | "POST"; readonly body?: unknown },
  ): Promise<TResponse> {
    const response = await this.fetcher(new URL(path, this.baseUrl), {
      method: init.method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    const body = await readJson(response);
    if (!response.ok) {
      const errorBody = isApiErrorBody(body)
        ? { ...body, status: response.status }
        : {
            message: `Agartha API ${path} failed with ${response.status}`,
            reason: "request_failed",
            status: response.status,
          };
      throw new AgarthaApiError(errorBody);
    }

    return body as TResponse;
  }

  private websocketUrl(path: string) {
    const url = new URL(path, this.baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  }

  private pollWatch(handlers: {
    readonly onMessage: (message: unknown) => void;
    readonly onError: (error: Error) => void;
    readonly onClose: () => void;
  }) {
    let closed = false;
    let seen = "";
    const poll = async () => {
      try {
        const events = await this.events(20);
        const latest = JSON.stringify(events);
        if (latest !== seen) {
          seen = latest;
          handlers.onMessage({ type: "events", events });
        }
      } catch (error) {
        handlers.onError(error instanceof Error ? error : new Error("Convex watch polling failed"));
      }
      if (!closed) timer = setTimeout(poll, 1200);
    };
    let timer = setTimeout(poll, 0);
    return {
      close: () => {
        closed = true;
        clearTimeout(timer);
        handlers.onClose();
      },
    };
  }
}

export interface WatchRequest {
  readonly chunk: ChunkCoord;
  readonly radiusChunks: number;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text, reason: "invalid_json" };
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "reason" in value &&
    "message" in value &&
    typeof (value as { reason?: unknown }).reason === "string" &&
    typeof (value as { message?: unknown }).message === "string"
  );
}
