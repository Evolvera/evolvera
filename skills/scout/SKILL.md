---
name: scout
description: Use the scout agent for codebase exploration, file discovery, and evidence gathering. Invoke when you need to find files, understand code structure, map dependencies, or gather context before planning or implementing. Scout is READ-ONLY — it never modifies code.
---

# Scout Skill — Codebase Exploration Agent

> **⚡ EFFICIENCY FIRST**: There is one scout role, not one active session. Give each session one coherent mission. When bounded structure evidence proves genuinely independent angles, use a mapped parallel wave and synthesize the evidence before planning.

## When to Use

Invoke `Agent(subagent_type="scout")` in these situations:

| Situation | Why Scout |
|-----------|-----------|
| **Need to find files** | "Where is the auth logic?" "Which files handle payments?" |
| **Understand code structure** | "How is this project organized?" "What are the entry points?" |
| **Map dependencies** | "What depends on this module?" "What does this service import?" |
| **Gather context before planning** | Before calling planner, send scout to explore relevant areas |
| **Debug — find root cause** | "Where is this error thrown?" "What code path leads here?" |
| **Verify patterns** | "Does this project use clsx or classnames?" "Is there a cn() utility?" |

### Scout Fan-out Gate

Direct `grep`/`read` comes first; delegate only what direct tools cannot answer cheaply. Default to **one coherent scout**. After bounded structural orientation, fan out only when it exposes two or more independent evidence questions that can advance the same planning contract without waiting on one another. Create a compact **Scout Fan-out Map** in the orchestrator's evidence notes before launch; it is not a plan artifact, task, write-set proof, or parallel authorization.

Inventory every product/client/runtime root in scope before the map. A root cannot be silently pruned because of its name, platform, or presumed legacy status: assign a candidate or record direct evidence for `INACTIVE | LEGACY | OUT_OF_SCOPE`; otherwise it remains `UNKNOWN`.

For each candidate, record:
- **ID and decision question** — one answer the planner needs, not a broad topic;
- **primary semantic boundary** — the behavior/contract/state/validation concern it owns;
- **source scope and explicit overlap** — roots/patterns to search and any named bridge file/symbol another candidate may also read;
- **required handoff** — exact paths/symbols, upstream/downstream anchors, candidate dispositions, validation/resource facts, or bounded gap the synthesis needs;
- **admission** — `ADMIT` (independent and ready now), `DEFER` (depends on another result), `MERGE` (must remain with a causal neighbor), or `SYNTHESIS` (cross-shard reconciliation after evidence exists);
- **stop condition** — when it returns `COMPLETE` or `PARTIAL` instead of expanding.

### Capacity and Shard-Breadth Gate

Take a capacity snapshot before launch: effective background `maxConcurrent` after any project override, currently active background agents, and free slots. Launch every ready `ADMIT` candidate up to free slots in one message with `run_in_background: true`; do not impose an arbitrary 2–4 cap or leave a slot idle while an independent `ADMIT` candidate is ready. If more candidates are admissible than slots, choose a full source-scoped wave that maximizes decision coverage, record the deferred candidates, and recompute after the wave. The configured cap limits normal background agents; it is a ceiling, not a reason to manufacture shards.

A provisional candidate spanning three or more independent semantic regions triggers a **Shard-Breadth Audit**. This is not an automatic split or region cap: split only at a repository-supported semantic seam, or record the exact causal state/contract/contradiction that requires one coherent scout. Generic labels such as “backend”, “frontend”, “full system”, or “all tests” are not coupling evidence. A directory, file count, or generic test-only lookup also does not justify a shard; focused tests travel with the production concern they verify unless runner/resource safety is itself an independent question. Never split when one result determines the next search, one causal state model must stay coherent, exhaustive closure or contradiction resolution needs one context, or the shards would duplicate retrieval.

After the wave, reconcile a compact **Seam Synthesis**: root inventory; capacity/admission disposition; each shard's semantic unit and evidence; cross-shard upstream/downstream anchors; shared or serial surfaces; validation/resource facts; candidate `AFFECTED | UNAFFECTED` dispositions; contradictions; and gaps. A scout shard accelerates evidence retrieval; it never proves a task boundary, write-set isolation, valid checkpoint, or builder parallelism. If a result exposes a missing relation, launch one focused follow-up in the next wave only when its question is now bounded; otherwise use one synthesis scout.

### Whole-System Reconnaissance

For a request to understand an entire frontend, backend, and product purpose, do not assign one broad backend scout, one broad client scout, and one premature purpose scout. Inventory all versioned/executable roots first—such as API, web, native/mobile, landing, workers, shared contracts, and operational/test harnesses when present—then admit each independent flow/domain/client boundary that can be investigated now. A purpose or behavior reconciliation across those roots is normally `SYNTHESIS`; a bounded documentation/claims inventory may be `ADMIT`. Broad repositories can legitimately fill all available background slots when the map proves independent questions.

### Use one coherent scout when splitting would lose coherence

Use a single `scout` when the answer needs one coherent mental model across many files, long state retention, contradiction resolution, or an exhaustive audit.

Examples:
- "explain the whole auth architecture and edge cases";
- "audit analytical correctness across emulator + pricing + probability + tests";
- "map end-to-end payment flow including retries, webhooks, DB state, and UI states";
- "prove coverage is sufficient against business requirements";
- any investigation where partial independent reports would be misleading without cross-file synthesis.

Pattern:
```ts
Agent({
  subagent_type: "scout",
  description: "Audit payment flow",
  prompt: "MISSION: Build one coherent evidence-based map of payment flow across API, DB, webhooks, retries, UI state, and tests. Exhaustive enough to identify contradictions. Return exact file paths/lines and gaps."
})
```

### Use parallel scoped scouts for independent angles

First make the compact map. This small example admits three scouts; it is not a concurrency cap.

| Candidate | Admission | Decision question | Boundary / scope | Required handoff |
|---|---|---|---|---|
| `entry-consumers` | `ADMIT` | Which entry points and consumers observe the behavior? | `<consumer-root>`, consumer tests; named shared-contract overlap | callers, UI/API contracts, focused tests |
| `domain-contract` | `ADMIT` | Which domain state and contract fields govern it? | `<domain-root>`, `<shared-contract-root>`; named overlap | invariants, producer/consumer anchors, affected candidates |
| `runner-safety` | `ADMIT` | Can the relevant validation run without touching protected state? | test scripts/config only | command, setup/teardown, resources, destructive hooks |
| `purpose-reconciliation` | `SYNTHESIS` | Which implemented journeys support or contradict product claims? | cross-root bridge evidence after the `ADMIT` wave | confirmed purpose, contradictions, gaps |

```ts
// This map admits three. For a broader map, launch every ready ADMIT candidate up to free capacity in this same message.
Agent({ subagent_type: "scout", run_in_background: true, description: "Map entry consumers", prompt: "SCOUT FAN-OUT SHARD\nID: entry-consumers\nQUESTION: Which entry points and consumers observe the approved behavior?\nBOUNDARY: entry/consumer flow only.\nAREA: <consumer-root> and <consumer-test-root>; read <shared-contract-root> only at named overlap symbols.\nHANDOFF: paths/symbols, upstream/downstream anchors, focused tests, and gaps.\nSTOP: Return PARTIAL if the answer requires domain-state semantics outside this boundary." })
Agent({ subagent_type: "scout", run_in_background: true, description: "Map domain contract", prompt: "SCOUT FAN-OUT SHARD\nID: domain-contract\nQUESTION: Which domain state and contract fields govern the approved behavior?\nBOUNDARY: producer/domain contract only.\nAREA: <domain-root> and <shared-contract-root>; read consumer callers only at named overlap symbols.\nHANDOFF: invariants, producer/consumer anchors, candidate artifacts, and gaps.\nSTOP: Return PARTIAL if entry behavior is required beyond the named overlap." })
Agent({ subagent_type: "scout", run_in_background: true, description: "Inspect runner safety", prompt: "SCOUT FAN-OUT SHARD\nID: runner-safety\nQUESTION: What does the relevant validation command configure and reach?\nBOUNDARY: runner/config/resource evidence only.\nAREA: <package-manifest>, <test-config-root>, and setup/teardown.\nHANDOFF: command path, resource identities, destructive hooks, and gaps.\nSTOP: Return PARTIAL if runtime execution is required." })

// While scouts run, keep working:
// - read obvious high-signal bridge files
// - run targeted grep/find commands
// - inspect tests/logs/configs
// - form hypotheses to validate against scout reports

// Collect results after useful local work or when needed
get_subagent_result({ agent_id: "[id1]", wait: true })
```

Reconcile the Seam Synthesis yourself. Launch a final `SYNTHESIS` scout only if a cross-shard bridge or contradiction remains unresolved after focused direct reads.

## When NOT to Use

- **DO NOT** use scout for code modification (use builder)
- **DO NOT** ask scout to run tests, project code, git commands, generators, formatters, or shell commands. Scout intentionally excludes `bash`, `write`, and `edit`; the orchestrator must run any required command.
- **DO NOT** use scout for writing plans (use planner)
- **DO NOT** use scout for trivial single-file lookups (use `read`/`grep` directly)
- **DO NOT** use scout for frontend design critique or visual polish; use website/design agents instead
- **DO NOT** split one coherent question across several scouts — parallelize only genuinely independent missions

## How to Invoke

```
Agent({
  subagent_type: "scout",
  description: "[3-5 words]",
  prompt: "MISSION: [one coherent objective]\n\nSCOPE: [bounded evidence surface]\n\nFOCUS ON:\n- [aspect 1]\n\nAREA: [specific root paths/patterns]\n\nReturn file paths, key findings, and evidence. Return PARTIAL with the smallest next retrieval if the coherent scope expands."
})
```

## Scout Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `subagent_type` | ✅ | `"scout"` |
| `description` | ✅ | Short 3-5 word summary |
| `prompt` | ✅ | Detailed mission with FOCUS ON and AREA |
| `run_in_background` | ✅ **Always `true` for parallel** | `true` when launching multiple scouts |
| `max_turns` | Optional | Set only when the mission has an explicit runtime boundary; otherwise use the agent default |

## Scout Behavior Rules

Scout agents follow these absolute rules:

1. **READ-ONLY BY CAPABILITY** — Uses only `read`, `grep`, `find`, and `ls`; never modifies, creates, executes, or edits files and never creates checkpoints. If command output is required, it returns `PARTIAL` with the exact command for the orchestrator.
2. **NO UNGROUNDED DESIGN** — Only reports findings. A fan-out handoff may identify observed boundaries, bridges, shared surfaces, and gaps, but never recommends a task, DAG, write set, or implementation split
3. **NO ASSUMPTIONS** — Says "NOT FOUND" if no evidence exists and states searched scope
4. **QUOTE EXACTLY** — Copies relevant source text verbatim when quoting code
5. **EVIDENCE-BASED** — Every claim backed by file evidence
6. **SOURCE-SCOPED** — Search explicit source roots or tracked-file patterns. Exclude `.git`, `.next`, `node_modules`, `dist`, `build`, coverage, caches, generated bundles, binaries, and source maps unless explicitly in scope; never request an unscoped recursive repository search.

## Scout Output Format

Scout returns a structured report with:
- **Files Found**: Table of relevant files with paths and descriptions
- **Evidence**: Verbatim quotes from code or command output
- **Coverage Receipt**: required only when claiming complete impact/dependency coverage
- **Gaps**: What's missing or pending
- **Next Retrieval**: The smallest useful next search/read, if evidence is incomplete
- **Dependency Graph**: include when the mission is about architecture, call flow, imports, exports, or module relationships
- **Parallel Handoff**: only when the prompt declares `SCOUT FAN-OUT SHARD`; state shard ID/question/boundary, direct evidence usable by planning, cross-shard anchors/overlap, shared or serial surfaces, validation/resource facts, and gaps—never a task recommendation

### Retrieval Completeness

Scout should retrieve enough evidence to answer its mission. A mission claiming complete impact or dependency coverage must return a compact coverage receipt: semantic anchors; searched scope/patterns; relationship paths derived from repository evidence; each discovered candidate classified `AFFECTED | UNAFFECTED` with evidence; and unresolved candidates. Any greppable candidate still unresolved makes the result `PARTIAL`. A narrowly scoped scout may close only its named slice, never the broader semantic change.

Continue searching only when:
- the current evidence does not answer the scout's assigned question;
- a required file, symbol, parameter, owner, date, ID, or source is missing;
- the mission asks for exhaustive coverage or dependency/call graph mapping;
- the report would otherwise contain an important unsupported claim.

Do not keep searching to improve phrasing or collect nonessential examples. Absence of evidence is not evidence of absence unless the searched scope is appropriate and stated.

### Finite Inventory Receipt (conditional)

Only for explicitly finite inventory/audit/classification missions, the orchestrator supplies the independently source/config-derived expected stable IDs. Keep normal Markdown reporting, and append one fenced JSON block with this shape:

```json
{"status":"COMPLETE","items":[{"id":"stable-id","classification":"mission-specific value","evidence":["path:line or command/citation"],"gap":null}]}
```

`status` is `COMPLETE` or `PARTIAL`; `items` contains each expected ID exactly once, with no unexpected IDs. IDs are nonblank strings; classification is a nonblank mission-specific string; evidence is an array of nonblank citation/command strings; `gap` is `null` or a nonblank reason. `UNKNOWN` requires a nonblank gap. Known/resolved items require nonempty evidence. Any `UNKNOWN` or nonempty gap is unresolved and therefore cannot support `COMPLETE`; keep unresolved items explicit and explain why they were not inspected. The receipt does not itself certify evidence meaning, expected-universe validity, classification correctness, or safety.

Scouts remain read-only: include JSON inline in the response; do not write files or execute the checker. The orchestrator may materialize run-owned temporary JSON (`expected.json` is a JSON array of unique nonblank string IDs) and run `node <absolute-scout-skill-dir>/scripts/check-inventory.mjs <expected.json> <receipt.json>` before synthesis/resume. Resolve that absolute directory from the loaded scout SKILL path; global versus project-local skill resolution determines which directory applies. If it fails, return only concrete failed IDs or a malformed counterexample to the same scout for focused correction, not a relaunch of the broad mission. Preserve the two-failure-without-new-hypothesis stop rule; never waive ordinary missing-evidence or safety checks.

### Dependency Graph (conditional)

When the mission requires architecture/dependency/call-flow evidence, or when imports/exports are central to the answer, build and return a dependency graph:

```json
{
  "dependencyGraph": {
    "nodes": [
      {"id": "src/auth/login.ts", "type": "entry|utility|route|component|service|model|config|test"},
      {"id": "src/auth/jwt.ts", "type": "utility"},
      {"id": "src/api/users.ts", "type": "route"}
    ],
    "edges": [
      {"from": "src/auth/login.ts", "to": "src/auth/jwt.ts", "type": "import|export|extends|implements|calls"},
      {"from": "src/api/users.ts", "to": "src/auth/jwt.ts", "type": "import"}
    ]
  }
}
```

**Rules:**
- Add every relevant import/export/call relationship found within the assigned scope
- Include external dependencies as nodes with type `external` when they matter to the mission
- Include the JSON block at the end of the report
- If graphing was requested but no relationships were found, return empty arrays: `"nodes": [], "edges": []`
- Use relative file paths as node IDs
- Do not build a graph for simple file-finding or single-symbol lookup unless it improves the answer

## Integration Pattern

```
User Request
    │
    ├── Is it trivial? (single file/line) ──→ Use read/grep directly
    │
    └── Is it broad? (multiple files/areas) ──→ Use scout
            │
            ├── One coherent concern ──→ Single scout
            │
            └── Independent evidence questions ──→ root inventory + Fan-out Map → all ready ADMIT scouts up to free capacity
                    │
                    ├── Main model continues direct inspection while scouts run
                    │
                    └── Seam Synthesis + focused bridge reads ──→ Hand to planner/builder
```

### Parallel Decomposition Guide

Use these as candidate questions only after root inventory and the Shard-Breadth Audit; do not instantiate every column or split by artifact category alone. Attach focused tests to the semantic concern they verify. A separate validation shard is justified only when runner/config/resource safety has an independent answer. Cross-root purpose reconciliation is `SYNTHESIS`, not an initial `ADMIT` shard.

| Mission Type | Candidate independent question | Required handoff | Keep coherent when |
|-------------|--------------------------------|------------------|--------------------|
| **Feature** | Entry/consumer behavior; domain/contract state; independently material runner safety | interfaces, invariants, focused tests, resource facts | one state transition crosses all three |
| **Bug Fix** | Error origin/consumer; independent persistence or transport boundary; isolated test-runner facts | causal anchors, candidate dispositions, reproduction limits | root cause needs one causal timeline |
| **Refactor** | External consumers; internal module boundary; independent registration/runtime loading | imports/calls, shared bridges, preservation tests | one compatibility contract governs all consumers |
| **New Feature** | Adjacent established behavior; data/contract constraints; independently material configuration boundary | reusable patterns, invariants, affected candidates | product semantics or rollout state is unresolved |

## Examples

### Example 1: Auth discovery with a mapped parallel wave
```
// Orientation found independent entry/consumer, token-contract, and runner-safety questions.
// Launch together, not sequentially; tests follow the owning entry or token concern.
Agent({ subagent_type: "scout", run_in_background: true, description: "Map auth consumers", prompt: "SCOUT FAN-OUT SHARD\nID: auth-consumers\nQUESTION: Which routes and UI/API consumers use the auth result?\nBOUNDARY: auth entry/consumer behavior and its focused tests.\nAREA: <auth-entry-root>, <consumer-root>, <focused-auth-test-root>.\nHANDOFF: paths, symbols, consumer contracts, tests, gaps." })
Agent({ subagent_type: "scout", run_in_background: true, description: "Map token contract", prompt: "SCOUT FAN-OUT SHARD\nID: token-contract\nQUESTION: Which session/JWT fields and validations govern auth semantics?\nBOUNDARY: token contract and persistence helpers.\nAREA: <auth-domain-root>, <session-helper-root>; named route overlap only.\nHANDOFF: invariants, producer/consumer anchors, candidate artifacts, gaps." })
Agent({ subagent_type: "scout", run_in_background: true, description: "Inspect auth runner", prompt: "SCOUT FAN-OUT SHARD\nID: auth-runner\nQUESTION: What config and resources does auth validation reach?\nBOUNDARY: test runner/setup/teardown only.\nAREA: <package-manifest>, <test-config-root>, <auth-setup-root>.\nHANDOFF: command path, resource facts, destructive hooks, gaps." })
```

### Example 2: Payment flow needs one coherent scout
```
Agent({
  subagent_type: "scout",
  description: "Map payment flow",
  prompt: "MISSION: Build one coherent evidence-based map of the payment flow across API endpoints, DB models, webhooks, external integrations, retries, error handling, and tests. Return exact file paths/lines, contradictions, and gaps."
})
```
