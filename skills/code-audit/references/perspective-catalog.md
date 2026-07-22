# Adaptive Perspective Catalog

This catalog supplies prompts, not a checklist. Start from evidence about the audited system and objective; do not allocate missions merely to cover headings.

## Derivation method

1. Describe the objective, users/actors, entry points, privileged operations, trust boundaries, data and state, lifecycle, concurrency, external interfaces, failure consequences, languages/frameworks, tests, and deployment/config evidence.
2. Turn material failure hypotheses into questions that can be answered from an exact mirror scope. Add domain-specific perspectives when the evidence exposes a specialized invariant (for example clinical eligibility, compiler semantics, custody, scheduling, or protocol consensus).
3. Select the smallest set whose answers can materially change the audit outcome. Dedupe missions that share the same invariant, path, and proof route; shard only when a perspective cannot fit coherently in one mission.
4. For every high-impact family that appears applicable but is omitted, record a short omission rationale. Unknown applicability is a gap, not an automatic mission.
5. Give each mission one perspective/shard, an ID, question, materiality, exact mirror scope, required evidence, scout route, and stop conditions.

## Candidate families

| Family | Applicability triggers | Example questions |
|---|---|---|
| Domain correctness & invariants | Business/domain rules, state machines, parsers, policy engines | Which reachable transition violates a repository-stated invariant? Are invalid combinations representable? |
| Input, contract & error behavior | Public functions, APIs, CLI, files, messages, schemas | Are boundary inputs normalized and rejected consistently? Does failure preserve the advertised response contract? |
| Authentication, authorization & tenancy | Identity, roles, ownership, multi-tenant data | Can a reachable caller cross an object, role, or tenant boundary without the required decision? |
| Security, injection & abuse | Interpreters, shells, templates, uploads, redirects, resource controls | Does untrusted input reach a dangerous sink without the required encoding/validation? Is abuse bounded? |
| Privacy & secrets | PII, tokens, logs, analytics, exports | Can sensitive data enter output/log/error paths contrary to policy? Are secret sources and sinks separated? |
| Data integrity, transactions & migrations | Persistent state, schemas, writes, migrations | Can partial failure violate atomicity or referential/domain constraints? Is migration compatibility evidenced? |
| Money, time, units & numerics | Billing, dates/time zones, quantities, floating point | Are rounding, units, ordering, overflow, calendar and timezone rules explicit and preserved? |
| Concurrency, async, idempotency & retries | Jobs, queues, parallel requests, webhooks | Which interleaving can duplicate/lost-update state? Are retries and deduplication keyed to the true operation? |
| Lifecycle & resources | Startup/shutdown, files, sockets, subscriptions, caches | Are resources released on all reachable exits? Can stale state survive lifecycle transitions? |
| External APIs, serialization & compatibility | SDKs, protocols, wire/storage formats, versioning | Do producers and consumers agree on optionality, encoding, ordering and version fallback? |
| Performance & scalability | Hot paths, unbounded collections, N+1, large input | Is work or memory unbounded relative to attacker/user-controlled input? What evidenced workload matters? |
| Reliability & recovery | Failure domains, retries, backup/restore, degraded operation | Does recovery preserve idempotency and durable state? Are failure modes surfaced instead of silently accepted? |
| Observability, operations, deploy & config | Env/config, logging, alerts, deployment manifests | Can operators distinguish success, partial failure, and corruption? Are defaults/precedence safe and evidenced? |
| Dependencies & supply chain | Lockfiles, plugins, install hooks, vendored code | Are runtime dependencies pinned/verified appropriately? Do hooks or transitive capabilities cross trust boundaries? |
| Frontend, runtime, accessibility, UX, SEO & i18n | Browser/UI routes, forms, rendering, localization | Is the critical journey keyboard/screen-reader operable? Do hydration, error, locale and metadata states preserve the contract? |
| Tests, oracles, build & tooling | Test suites, fixtures, CI, generators, compilers | Can the oracle detect the hypothesized failure? Do tests assert behavior rather than implementation or weakened expectations? |
| Maintainability & architecture | Boundary erosion, duplicated policy, cycles, ownership | Does divergence create a concrete correctness risk in a reachable path? Avoid publishing style preferences as defects. |
| Documentation & runbooks | Public docs, operator procedures, recovery steps | Does a documented command or contract contradict executable evidence with material consequence? |

A mission may combine adjacent labels only when one coherent semantic question and proof route covers them. The audit report must show selected perspectives, omitted high-impact rationales, and uncovered gaps.