import { Play } from "@phosphor-icons/react";
import type React from "react";
import { useState } from "react";

export interface AgentCommandPanelProps {
  readonly commands?: readonly string[];
  readonly context?: readonly AgentCliContextItem[];
  readonly mode?: "human" | "agent";
  readonly onRunCommand: (command: string) => string;
}

export interface AgentCliContextItem {
  readonly label: string;
  readonly value: string;
}

export function AgentCommandPanel({ commands = [], mode = "human", onRunCommand }: AgentCommandPanelProps) {
  const [command, setCommand] = useState("flower 70 52");
  const [result, setResult] = useState("Ready");

  function submitCommand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(onRunCommand(command));
  }

  return (
    <section className="inspector-panel agent-command-panel gradient-border gradient-border-to-br" aria-label="Agent command">
      <h2>Agent command</h2>
      <form className="agent-command-panel__form" data-agent-id="agent-command-form" onSubmit={submitCommand}>
        <input
          aria-label="Agent command input"
          data-agent-id="agent-command-input"
          onChange={(event) => setCommand(event.currentTarget.value)}
          spellCheck="false"
          value={command}
        />
        <button aria-label="Run agent command" data-agent-id="run-agent-command" type="submit">
          <Play aria-hidden="true" size={15} weight="fill" />
        </button>
      </form>
      <output aria-label="Agent command result" data-agent-id="agent-command-result" role="status">
        {result}
      </output>
      {mode === "agent" && commands.length > 0 ? (
        <div className="agent-command-panel__commands" aria-label="Agent command reference">
          {commands.map((item) => (
            <code key={item}>{item}</code>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function AgentCliBar({ commands = [], context = [], onRunCommand }: AgentCommandPanelProps) {
  const [command, setCommand] = useState("flower 70 52");
  const [result, setResult] = useState("Ready");
  const suggestions = commands.slice(0, 4);

  function submitCommand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(onRunCommand(command));
  }

  function useSuggestion(nextCommand: string) {
    setCommand(nextCommand);
  }

  return (
    <section className="agent-cli-bar gradient-border-2" aria-label="Agent CLI" data-agent-region="agent-cli">
      <div className="agent-cli-bar__context" aria-label="Agent context">
        {context.map((item) => (
          <span key={item.label}>
            {item.label}: <strong>{item.value}</strong>
          </span>
        ))}
      </div>
      <label htmlFor="agent-cli-input">Agent command</label>
      <form className="agent-cli-bar__form" onSubmit={submitCommand}>
        <span aria-hidden="true">&gt;</span>
        <input
          id="agent-cli-input"
          data-agent-id="agent-cli-input"
          onChange={(event) => setCommand(event.currentTarget.value)}
          spellCheck="false"
          value={command}
        />
        <button aria-label="Run agent CLI command" data-agent-id="run-agent-cli-command" type="submit">
          <Play aria-hidden="true" size={16} weight="fill" />
        </button>
      </form>
      <div className="agent-cli-bar__footer">
        <output aria-label="Agent CLI result" data-agent-id="agent-cli-result" role="status">
          {result}
        </output>
        {suggestions.length > 0 ? (
          <div className="agent-cli-bar__suggestions" aria-label="Agent command suggestions">
            {suggestions.map((item) => (
              <button key={item} onClick={() => useSuggestion(item)} type="button">
                {item}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
