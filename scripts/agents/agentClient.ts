import type {
  ActionEnvelope,
  ActionResult,
  ActionType,
  AgentPerception,
} from "@agartha/protocol/actions";

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
  readonly actionType: ActionType;
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
