# Project Memory Summary

- PI upgrades must preserve the `@earendil-works` package family; `pi-vscode` 0.0.9 hardcodes `@mariozechner` and can replace the required fork.
- Known compatible baseline is Node `>=22.19.0` (validated locally with fnm `22.22.3`) and PI `0.82.1`; use repository installers and verify fresh startup.
- Explanatory clarity is global in `SYSTEM.md`: assume engineering literacy, simplify the causal structure rather than the technical level, stay on the actual subject, and use Feynman-inspired explanation only when needed. Analogies remain optional; communication modes control cadence.
- A local/test-labelled resource is not disposable. Before stateful validation require `NO_STATEFUL_RESOURCES` or `DISPOSABLE_VERIFIED` run ownership for every reachable resource; otherwise do not execute. Suspected mutation stops all writes and forbids unapproved restore/reseed.

## Architecture Map

- Source: `.pi/memory/architecture.json`; generated self-contained viewer: `.pi/memory/architecture.html`.
- Snapshot head: `9bdf6f5ee0f84bf66d88c27c5a4c6536e3a984f6`; status: `CURRENT`.
- Counts: actors 9; components 54; data objects 18; relationships 36; flows 7; evidence 26; gaps 4.
- Critical flows: `terminal-request-flow`, `planned-delivery-flow`, `project-memory-update-flow`, `install-update-flow`, `studio-rpc-interface-flow`, `flow-issue-delivery-flow`, `website-production-flow`.
- Gaps: open `interface-dockerfile-version-drift`; accepted `mcp-adapter-internals`, `vscode-bridge-source-external`, `live-delivery-state-excluded`.
- For architecture-sensitive work, inspect targeted JSON records and their `evidenceIds`, then verify the referenced repository evidence.
