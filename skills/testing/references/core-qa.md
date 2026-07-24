# CORE QA Reference

Load this reference only when the selected QA level is `CORE`.

## Claim Boundary

CORE is the smallest independent behavioral gate that can materially falsify the declared bounded scope. A `CORE PASS` says only that every acceptance item declared for that CORE scope passed at the exact SHA. It never means product-wide, browser, end-to-end, full-stack, deployment, or production PASS.

Direct static closure is outside QA and is not a level. If deterministic producer/orchestrator checks already close a mechanical change, do not create a ceremonial CORE run.

## Technique Selection

Choose the narrowest relevant oracle:

- focused unit, parser, contract, snapshot, property/example, or component check;
- one happy path plus directly affected boundary/error and preservation seam;
- framework-native isolated request/client checks when they do not imply a real deployment;
- jsdom, component simulation, or mocked critical paths only with an explicit `simulated/mocked partial evidence` label;
- static inventory from `../scripts/inventory-qa-surfaces.mjs` only to discover candidate surfaces. Inventory is never safety proof or a verdict.

Preserve existing trusted oracles. A changed snapshot or expectation is evidence to inspect, not permission to bless a product change. Property-based techniques are conditional: use them when meaningful invariants and generators exist, and retain the first falsifying example and seed/shrink evidence. Coverage can reveal unexercised code but has no universal pass threshold.

## Evidence Rules

Verify the exact SHA and resolve command indirection before execution. Apply the always-loaded resource gate in `../SKILL.md`; fixed/shared/unknown resources make required runtime evidence `UNVERIFIED`. Retain the first failure. If a retry passes, label the evidence flaky and do not return a clean `PASS`.

Return only `PASS | BLOCKED | UNVERIFIED`, bound to `CORE`, SHA, and declared scope.
