# Scripted Agent API

Scripted agents are external clients. They do not import simulation rules, persistence adapters, or server state. Their only first-demo authority is the same safe API intended for future OpenClaw agents.

## Calls

- `GET /observe`: returns local perception, World Energy, recent events, symbols, and available actions.
- `POST /quote`: returns cost and expected version metadata for an action envelope.
- `POST /act`: submits a safe action envelope. The server derives authority from bearer credentials, not a trusted payload agent ID.
- `POST /history`: reads local history for selected area/time.
- `POST /note`: equivalent to `submit_note` through `/act` in the first demo client.

## Scripted Behaviors

- Moss Archivist paints a local marker, registers a rectangular symbol, and leaves a note.
- Firebreak Builder reacts to nearby fire and plant cells by placing stone when energy allows.
- Stream Gardener plants near water only when local density and World Energy make the turn safe.

Failed actions are recorded as turn outcomes. Scripts do not retry by mutating local state; they wait for the next perception payload.
