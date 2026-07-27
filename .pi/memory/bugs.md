# Confirmed Bugs

## VS Code upgrade replaces the required PI fork

- **Symptom:** after **Upgrade Pi and Packages**, startup fails while loading `pi-xai-oauth`, with `@earendil-works/pi-ai/dist/index.js/compat` in the missing-module path.
- **Root cause:** `pi-vscode` 0.0.9 hardcodes `@mariozechner/pi-coding-agent@latest`; this configuration and `pi-xai-oauth` require the Earendil package family. The published `@earendil-works/pi-ai@0.80.10` still contains and exports `./compat`; the failure is package-family/loader resolution skew, not removal of `compat.js`. The reported Node `22.12.0` is also below the baseline's declared `>=22.19.0` engine.
- **Prevention:** use Node `>=22.19.0`, run the repository installers, keep the tested Earendil/xAI pair aligned, and avoid the VS Code upgrade button until upstream detects the installed package instead of hardcoding one.
- **Upstream tracking:** `pithings/pi-vscode#15` already records the hardcoded wrong-package behavior.

## Planner accepted an invalid intermediate checkpoint

- **Symptom:** a builder correctly returned `BLOCKED` because its isolated task could not pass the plan's deterministic gate; artifacts needed to restore validity had been deferred to a later task even though the final combined state was plausible.
- **Root cause:** bounded scout completion was treated as semantic coverage proof, and the planner checked final acceptance without proving affected-artifact closure or replaying the gate against the exact repository state after each task alone.
- **Prevention:** complete impact claims require a coverage receipt with semantic anchors, searched relationship paths/scope, candidate dispositions, and explicit gaps. Every writing task carries a proportional proof of closure, checkpoint validity, and acceptance reachability, followed by one counterexample attempt. Any unresolved greppable candidate or dependency on later restoration blocks planning; do not encode the incident's artifact types as a fixed checklist.

## Test suite deleted development data

- **Symptom:** a validation run executed an API suite against the same local database holding user-created development records; suite cleanup removed those records and follow-up repair activity risked further divergence.
- **Root cause:** the orchestrator treated local/test-labelled configuration as disposable without resolving env precedence, runner setup/teardown, destructive hooks, and the actual database identity/ownership.
- **Prevention:** before any potentially stateful command, require `NO_STATEFUL_RESOURCES` or resource-by-resource `DISPOSABLE_VERIFIED` proof. Localhost, `.env.test`, `NODE_ENV=test`, Docker, transactions, a `test` name, or backups are insufficient. Never run reset/truncate/drop/delete/migration cleanup against resources that predate the run or contain user/dev/shared/staging/production data. On suspected mutation stop immediately; do not retry, restore, reseed, or recreate data without explicit authorization.

## UTM delete cascaded across a duplicated VM identity

- **Symptom:** during an authorized move to external storage, opening a byte-identical `.utm` copy created a second registry entry. Deleting the original entry through UTM then removed both the internal and external bundles and cleared both registry entries.
- **Root cause:** UTM assigned different registry UUIDs to the two entries, but both bundles retained the same embedded VM UUID. Registry-path separation and stopped-state evidence did not prove deletion isolation; UTM treated the duplicate bundles as one VM identity.
- **Prevention:** never use UTM `delete` as migration cutover when a copied bundle shares the embedded VM UUID, even if UTM shows separate registry UUIDs and paths. Use UTM's documented visual `Move` action on the sole registered original, or first prove deletion behavior against a disposable synthetic VM. A validated external copy is recovery evidence, not proof that deleting either registry entry is isolated. On accidental deletion, stop writes, detach the affected image, preserve a byte-identical sparsebundle copy, and perform recovery only against that copy with explicit authorization.
