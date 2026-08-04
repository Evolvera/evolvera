# Evolvera PI Architecture

- **Normalized source:** [`architecture.json`](architecture.json)
- **Interactive generated view:** [`architecture.html`](architecture.html)

## Landscape

Evolvera PI is organized into six internal systems: the orchestration control plane owns routing and outcome closure; the workflow skill library defines repeatable scout, planning, build, testing, Flow, website, and research workflows; the runtime extension platform adds PI hooks, tools, configuration, subagents, MCP integration, and persistence; the project-memory system keeps durable Markdown plus normalized architecture data; PI Studio provides a local browser-to-RPC workspace; and the installation/distribution system deploys versioned checkout assets into the global PI runtime.

The external boundary contains GitHub delivery services, model providers, Context7 MCP, and the VS Code client. These are represented only to the extent documented or configured in this repository.

## Durable rules

- The PI orchestrator owns the outcome, scope reconciliation, integration, and closure.
- Skills are workflow contracts; agents execute bounded, self-contained contracts.
- Extensions add runtime hooks, commands, and tools without replacing orchestrator ownership.
- Markdown remains the durable human narrative; `architecture.json` is the normalized architecture source; `architecture.html` is derived and never authoritative.
- Current GitHub delivery state is read from GitHub during Flow re-entry, not stored in architecture memory.

## Known limitations and gaps

- `interface-dockerfile-version-drift` is open: README and installers use PI 0.80.10, while `interface/Dockerfile` pins 0.80.3.
- `mcp-adapter-internals` is accepted: package internals are outside this repository.
- `vscode-bridge-source-external` is accepted: VS Code bridge implementation is external.
- `live-delivery-state-excluded` is accepted: current boards, issues, claims, and PR state are intentionally excluded.
