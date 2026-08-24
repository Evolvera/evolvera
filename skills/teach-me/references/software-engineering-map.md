# Software Engineering Knowledge Map

Subordinate reference for `/skill:teach-me`. It supplies **curriculum topology** — what depends on what, which question unlocks a cluster, which trap novices fall into, and what shows readiness to advance — plus the anti-pattern table.

It defines **no workflow**. `../SKILL.md` is the single authority for how teaching is conducted. Use this map to locate the *one* missing prerequisite behind a specific confusion, then return to the learner's actual question. Never read it out as a syllabus.

---

## Dependency spine (zero → advanced)

Each rung assumes the ones before it. Confusion at a rung is usually a gap one or two rungs lower.

1. **Machine** — program, process, memory, file, filesystem.
2. **Two machines** — client/server, network, address, DNS, port, latency.
3. **Conversation** — HTTP request/response, status, headers, body, statelessness.
4. **Contract** — API, serialization (JSON), schema, versioning, compatibility.
5. **Code you can change** — types, modules, errors, tests, version control.
6. **Memory that outlives the process** — database, transactions, indexes, data integrity.
7. **Who is allowed** — authentication, authorization, trust boundaries, input validation.
8. **Shape of one application** — boundaries, responsibilities, layers, modular monolith.
9. **Doing work later** — async, jobs, queues, events, caches.
10. **Qualities, not features** — capacity, latency, availability, consistency, durability, cost, operability.
11. **More than one machine, failing independently** — partial failure, timeouts, retries, idempotency, concurrency, ordering, replication, partitioning, backpressure.
12. **Getting it to users safely** — configuration, secrets, CI/CD, deployments, migrations, rollback, incidents, SLOs.
13. **Choosing** — requirements vs constraints, trade-offs, failure modes, build-vs-buy, ADRs, evolutionary architecture, capacity planning.
14. **Working with AI** — framing, evidence-first inspection, decomposition, tool contracts, oracles, review, injection, safe execution. (Depends on 5–8 and 13 to be *judged*; can be practiced from rung 5.)

Rungs 11–13 are where "it works on my machine" turns into "it works for users at 3am". Rung 14 is not a replacement for any earlier rung — it multiplies whatever judgment already exists.

---

## Cluster 1 — Foundations

**Purpose:** know what physically happens when software runs and when two machines talk. Without this, every later abstraction is memorized rather than understood.

**Covers:** program vs process, memory vs disk, files and paths, client/server, network and packets, DNS, ports, HTTP verbs/status/headers/body, request/response cycle, API as a contract, serialization (JSON), state vs statelessness.

**Prerequisites:** none.

**Key questions:**
- What is running, and where does it live when it is not running?
- When I open a URL, what talks to what, in what order?
- What exactly crosses the network — and in what format?
- If the server forgets everything between requests, how does it know who I am?

**Novice trap:** treating "the backend", "the API", and "the server" as one mystical object; assuming the frontend and backend share memory; assuming `localhost` behaves like production.

**Ready to advance when:** they can narrate one request end to end — browser → DNS → server → handler → response — and say where state could be kept at each hop.

---

## Cluster 2 — Code and data

**Purpose:** change a codebase without breaking it, and store data that stays correct.

**Covers:** types and interfaces, modules and imports, error handling vs error swallowing, tests (unit/integration) and what a test actually proves, Git (commit, branch, diff, history as evidence), relational databases, transactions and ACID, indexes, constraints, authentication vs authorization, data integrity.

**Prerequisites:** Cluster 1.

**Key questions:**
- What does this function promise, and what does it do when the promise cannot be kept?
- What does this test fail on — and would it fail if the feature were deleted?
- What guarantees survive a crash halfway through?
- Why is this query slow, and what would an index change?
- Who is the user (authentication) versus what may they do (authorization)?

**Novice trap:** `try/catch` that hides the error; tests that assert the code does what it does; putting authorization checks in the UI; trusting client-supplied identity; discovering indexes only after the table has a million rows.

**Ready to advance when:** they can point at a data invariant, say which constraint or transaction enforces it, and describe what a partial failure would leave behind.

---

## Cluster 3 — Application architecture

**Purpose:** decide what goes where inside one system, and why a boundary exists.

**Covers:** responsibilities and boundaries, coupling and cohesion, layered vs modular monolith, when a service becomes a separate service, synchronous vs asynchronous work, queues, events, caches, background jobs, public API design.

**Prerequisites:** Clusters 1–2.

**Key questions:**
- What single responsibility does this component own, and who else may write its data?
- Does the caller need the result *now*, or only that it will happen?
- What is the cost of this boundary — a function call, a network hop, a deployment, a team?
- If this cache is stale, who notices and how badly?
- What breaks if this component is down for ten minutes?

**Novice trap:** splitting into services to organize code rather than to isolate failure, scaling, or ownership; making everything async and losing error visibility; caching without an invalidation story; abstraction layers built for one implementation.

**Ready to advance when:** they can justify a boundary by naming what it isolates — failure, deployment, scaling, or ownership — and state its cost.

---

## Cluster 4 — Non-functional requirements

**Purpose:** describe the qualities users actually feel, in measurable terms.

**Covers:** workload/capacity (rate, concurrency, volume, tenancy, growth), latency and percentiles, throughput, availability targets, consistency models, durability, security and privacy, observability, operability, cost, team ownership and evolution.

**Prerequisites:** Clusters 1–3.

**Key questions:**
- Which number is the requirement: p50, p95, or p99 — and measured where?
- How much data, arriving how fast, retained how long?
- What does one hour of downtime cost, in money or trust?
- Can this read be stale by a second? By a minute? Never?
- Who gets paged, and what do they look at first?

**Novice trap:** "it must be fast and scalable and secure" with no numbers; optimizing averages while p99 users suffer; measuring nothing and then guessing at the bottleneck; treating security as a feature to add later.

**Ready to advance when:** they convert a vague quality ("must be reliable") into a target, a measurement point, and a consequence for missing it.

---

## Cluster 5 — Distributed systems

**Purpose:** reason about systems where parts fail independently and the network lies.

**Covers:** partial failure, timeouts, retries with backoff and jitter, idempotency, concurrency and race conditions, ordering, duplication, network partitions, replication, sharding/partitioning, leader election and consensus (conceptually), backpressure and load shedding.

**Prerequisites:** Clusters 1–4.

**Key questions:**
- If the call times out, did it happen? How would you ever know?
- What happens when this runs twice, or out of order?
- Which writes must be serialized, and what enforces that?
- When the downstream is slow, does this system queue forever or shed load?
- What is the failure domain — what fails *together*?

**Novice trap:** retrying a non-idempotent operation and duplicating money or messages; retry storms with no backoff or jitter; assuming message ordering; treating a network partition as impossible; unbounded queues that convert an outage into data loss.

**Ready to advance when:** they can take one call in a design, enumerate timeout/duplicate/reorder outcomes, and name the mechanism that makes each one safe.

---

## Cluster 6 — Delivery and operations

**Purpose:** ship changes to real users without breaking them, and recover when it goes wrong.

**Covers:** configuration and secrets, environments, CI/CD, deployment strategies, database migrations, backward/forward compatibility, canary and staged rollout, feature flags, rollback, incident response, SLI/SLO/error budgets.

**Prerequisites:** Clusters 2–4 (5 for multi-instance rollouts).

**Key questions:**
- During the deploy, old and new code run at the same time — is the schema compatible with both?
- What is the exact rollback step, and has it ever been executed?
- Which signal tells you the release is bad, and how fast?
- Where do secrets live, who can read them, and what is the rotation story?
- Is this migration reversible, or only forward-fixable?

**Novice trap:** deploying schema and code in one irreversible step; "rollback" that depends on the failed thing working; secrets in the repository or in the AI conversation; no canary because the change "is small"; treating a backup as a recovery plan without ever restoring one.

**Ready to advance when:** they can plan a breaking schema change as compatible steps, each independently deployable and reversible.

---

## Cluster 7 — Architecture decision-making

**Purpose:** choose under constraints and uncertainty, and leave a trace of why.

**Covers:** requirements vs constraints, trade-off analysis, failure-mode thinking, build-vs-buy, architecture decision records, evolutionary architecture and fitness functions, capacity planning, evidence and validation, technical debt as a deliberate position.

**Prerequisites:** Clusters 3–6.

**Key questions:**
- What must be true for this to be the right choice — and is it true today?
- What does this decision cost when it is wrong, and how expensive is reversing it?
- Which constraint is real (regulation, budget, team, deadline) and which is preference?
- What would we have to see in production to revisit this?
- Buy it, or build it — including the maintenance we are signing up for?

**Novice trap:** copying an architecture from a company with different constraints; treating reversible and irreversible decisions with equal ceremony; choosing for a hypothetical future scale; no record of *why*, so the next engineer re-litigates it.

**Ready to advance when:** they can write a five-line ADR — context, options, decision, consequences, revisit trigger — that a stranger could act on.

---

## Cluster 8 — AI collaboration

**Purpose:** use AI as leverage without importing its confidence as truth.

**Covers:** framing a request as an engineering contract, evidence-first inspection before generation, decomposition into verifiable units, tool/action contracts and least privilege, test oracles, reviewing generated diffs, prompt/runtime identity, hallucination and uncertainty, prompt injection and untrusted content, safe execution boundaries.

**Prerequisites:** practicable from Cluster 2; *judgment* requires Clusters 3 and 7.

**Key questions:**
- Did I state the outcome, the constraints, and what must not change?
- Does the model have the evidence to answer this, or is it filling a gap fluently?
- What is my oracle — the check that decides this is correct?
- What is in the write surface, and does the diff stay inside it?
- Is any content in the context untrusted — a web page, an issue, a log, a file from elsewhere?
- What would this action do if the model is wrong, and can I undo it?

**Novice trap:** asking for a solution before establishing the problem; accepting a confident answer about a library version or an internal API without checking; letting the scope drift ("while I was there, I also refactored"); running generated commands against real state; assuming a green build validates behavior; pasting secrets into the conversation.

**Ready to advance when:** they can turn a vague wish into a brief with outcome, evidence, `PRESERVE | CHANGE | REMOVE`, scope, acceptance, and rollback — and can name the specific check that would catch a plausible wrong answer.

---

## Anti-patterns and their real triggers

None of these is forbidden. Each is a **premature default** until its trigger is met by evidence. Use the order in `../SKILL.md`: legitimate concern → missing evidence → how it fails → simpler baseline → measurable trigger.

| Default | Legitimate concern | How it fails early | Simpler baseline | Trigger that justifies it |
|---|---|---|---|---|
| Microservices | Independent deploys, team autonomy, failure isolation | Distributed failure modes and ops cost added to a team that cannot yet run one service well; a distributed monolith with network calls between coupled parts | Modular monolith with hard internal boundaries | Multiple teams blocked on one deploy pipeline, or one component with genuinely different scaling/availability needs |
| Kubernetes | Reproducible deploys, self-healing, orchestration | Cluster operation becomes the main engineering activity; incidents are now cluster incidents | Managed platform / container service / single deployable | Real multi-service, multi-node scheduling needs plus someone who owns the cluster |
| Queues / event-driven | Decoupling, absorbing spikes, slow work off the request path | Errors become invisible; ordering and duplication bugs; unbounded backlog during an outage | Synchronous call, or a simple background job table | Work is genuinely slow/retryable, or the producer must survive consumer downtime |
| Caching | Latency and load relief | Stale and inconsistent reads; correctness bugs that appear only under traffic; a hidden second source of truth | Fix the query, add the index, reduce the work | Measured hot path where the same expensive result is read repeatedly and staleness is acceptable and bounded |
| NoSQL | Flexible schema, horizontal scale | Integrity moves into application code and erodes; joins reappear as N+1 loops | Relational database with real constraints | An access pattern or scale the relational option demonstrably cannot serve |
| Sharding | Data volume or write throughput beyond one node | Cross-shard queries, rebalancing, and operational pain long before the limit was near | Vertical scale, indexes, read replicas, archiving | A measured single-node ceiling with a natural partition key |
| Extra abstraction layer | Future flexibility, swappable implementation | An interface shaped by one implementation that must be rewritten for the second | Concrete code; extract after the third real repetition | Three proven repetitions, or an architectural requirement that already exists |
| Rewrite | The code is painful to change | Two systems to maintain, feature freeze, rediscovered edge cases encoded in the old code | Strangle incrementally behind a stable boundary | Measured inability to deliver, with a bounded, reversible migration path |
| Premature optimization | Performance matters | Complexity added to code that was never the bottleneck; readability lost | Measure first; optimize the proven hot path | A profile or trace naming this code as the bottleneck against a stated target |
| Blind retries | Transient failures are real | Duplicate side effects; retry storms that finish off a degraded dependency | One timeout with a clear error | Idempotent operation plus backoff, jitter, and an attempt ceiling |
| Delete / reset state to get unstuck | Restore a clean, known baseline | Destroys evidence and possibly real data; often irreversible; hides the actual bug | Read-only diagnosis on a copy you created this run | Resource is provably created and owned by this run — labels like `test`, `dev`, Docker, or "there's a backup" are not proof |
| Trusting a green build or a confident AI answer | Fast feedback, momentum | Type checks and unit tests do not exercise the user journey; fluent text is not evidence | Run the affected journey and observe the real result | Never a substitute; a green build is evidence about the build only |

---

## Using this map

1. Locate the learner's question in a cluster.
2. Check the cluster's prerequisites against what they have demonstrated — not what they should know.
3. If a prerequisite is missing, teach **only that one**, briefly, then return to the original question.
4. If nothing is missing, answer at their level and go one layer deeper than they asked, offered rather than imposed.
5. Use the readiness signal to decide whether to move up — never a checklist recited to the learner.
