# Project Memory Summary

- PI upgrades must preserve the `@earendil-works` package family; `pi-vscode` 0.0.9 hardcodes `@mariozechner` and can break `pi-xai-oauth`.
- Known compatible baseline is Node `>=22.19.0`, PI `0.80.10`, and `pi-xai-oauth` `1.3.6`; use repository installers and verify fresh startup.
- Explanatory clarity is global in `SYSTEM.md`: assume engineering literacy, simplify the causal structure rather than the technical level, stay on the actual subject, and use Feynman-inspired explanation only when needed. Analogies remain optional; communication modes control cadence.
- A local/test-labelled resource is not disposable. Before stateful validation require `NO_STATEFUL_RESOURCES` or `DISPOSABLE_VERIFIED` run ownership for every reachable resource; otherwise do not execute. Suspected mutation stops all writes and forbids unapproved restore/reseed.
