import type {
  ActionEnvelope,
  ActionResult,
  ActionType,
  AgentPerception,
} from "@agartha/protocol/actions";
import type {
  CollaborationEnvelope,
  CollaborationResponseEnvelope,
  DurableCollaborationStatus,
  ProjectEntryKind,
} from "@agartha/protocol/collaboration";
import type { WorldCoord } from "@agartha/protocol/world";

export interface CostQuote {
  readonly quoteId: string;
  readonly cost: number;
  readonly expectedChunkVersion?: number;
}

export interface AgentTransport {
  request<TResponse>(
    path: string,
    init: { readonly method: "GET" | "POST"; readonly token: string; readonly body?: unknown },
  ): Promise<TResponse>;
}

export interface AgentTurnRecord {
  readonly actionType: ActionType | `collab_${CollaborationEnvelope["operation"]}`;
  readonly accepted: boolean;
  readonly summary: string;
  readonly rejection?: string;
}

export class FetchAgentTransport implements AgentTransport {
  constructor(private readonly baseUrl: string) {}

  async request<TResponse>(
    path: string,
    init: { readonly method: "GET" | "POST"; readonly token: string; readonly body?: unknown },
  ): Promise<TResponse> {
    const response = await fetch(new URL(path, this.baseUrl), {
      method: init.method,
      headers: {
        Authorization: `Bearer ${init.token}`,
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    if (!response.ok) {
      throw new Error(`Agartha API ${path} failed with ${response.status}`);
    }

    return (await response.json()) as TResponse;
  }
}

export class AgentClient {
  constructor(
    readonly agentId: string,
    private readonly token: string,
    private readonly transport: AgentTransport,
  ) {}

  observe() {
    return this.transport.request<AgentPerception>("/observe", {
      method: "GET",
      token: this.token,
    });
  }

  quote(action: Omit<ActionEnvelope, "worldId" | "agentId">) {
    return this.transport.request<CostQuote>("/quote", {
      method: "POST",
      token: this.token,
      body: this.envelope(action),
    });
  }

  act(action: Omit<ActionEnvelope, "worldId" | "agentId">) {
    return this.transport.request<ActionResult>("/act", {
      method: "POST",
      token: this.token,
      body: this.envelope(action),
    });
  }

  submitNote(body: string, target?: unknown) {
    return this.act({
      actionType: "submit_note",
      payload: { body, target },
    });
  }

  collaborate<TPayload = unknown>(operation: CollaborationEnvelope<TPayload>["operation"], payload?: TPayload) {
    return this.transport.request<CollaborationResponseEnvelope>("/collaboration", {
      method: "POST",
      token: this.token,
      body: {
        operation,
        worldId: "origin",
        agentId: this.agentId,
        payload,
      } satisfies CollaborationEnvelope<TPayload>,
    });
  }

  enterCollaboration(position: WorldCoord, displayName?: string) {
    return this.collaborate("enter", { position, displayName });
  }

  say(body: string) {
    return this.collaborate("say", { body });
  }

  updateProject(body: string, options: { readonly title?: string; readonly kind?: ProjectEntryKind } = {}) {
    return this.collaborate("project", {
      body,
      kind: options.kind ?? "update",
      title: options.title,
    });
  }

  summarize(body: string, status: DurableCollaborationStatus = "decision") {
    return this.collaborate("summary", { body, status });
  }

  private envelope(action: Omit<ActionEnvelope, "worldId" | "agentId">): ActionEnvelope {
    return {
      worldId: "origin",
      agentId: this.agentId,
      ...action,
    };
  }
}

export function recordTurn(actionType: ActionType, result: ActionResult): AgentTurnRecord {
  return {
    actionType,
    accepted: result.accepted,
    summary: result.summary,
    rejection: result.reason,
  };
}

export function recordCollaborationTurn(
  operation: CollaborationEnvelope["operation"],
  result: CollaborationResponseEnvelope,
): AgentTurnRecord {
  return {
    actionType: `collab_${operation}`,
    accepted: result.ok,
    summary: result.ok ? collaborationSummary(operation, result) : result.error?.message ?? "collaboration rejected",
    rejection: result.error?.reason,
  };
}

function collaborationSummary(operation: CollaborationEnvelope["operation"], result: CollaborationResponseEnvelope) {
  if (operation === "say") return `message accepted in ${result.areaId ?? "local area"}`;
  if (operation === "enter") return `entered ${result.areaId ?? "local area"}`;
  if (operation === "project") return `project updated in ${result.areaId ?? "local area"}`;
  if (operation === "summary") return `summary recorded in ${result.areaId ?? "local area"}`;
  return `${operation} accepted`;
}
