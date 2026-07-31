---
name: scout
description: Use the scout agent for codebase exploration, file discovery, and evidence gathering. Invoke when you need to find files, understand code structure, map dependencies, or gather context before planning or implementing. Scout is READ-ONLY — it never modifies code.
---

# Scout Skill — Codebase Exploration Agent

> **⚡ EFFICIENCY FIRST**: There is one scout agent. Give it one coherent mission. When a mission has genuinely independent angles, **split it into parallel scoped scouts** and synthesize their evidence yourself.

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

### Parallelism and Separation of Concerns

Direct `grep`/`read` comes first; delegate only what direct tools cannot answer cheaply. Default to **one coherent scout**. Use parallel scoped scouts only when the mission has genuinely independent questions with disjoint search surfaces—routes vs data/model vs tests vs configuration. Launch an additional scout only when a result exposes a required missing dependency, not to "cover more ground". Never split to fill concurrency slots, when one result determines the next search, when evidence must be reconciled as one model, or when splitting duplicates retrieval. Launch a parallel group in one message with `run_in_background: true`, then synthesize its evidence once.

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

```ts
// Run all at once, in one assistant message, with run_in_background: true
Agent({ subagent_type: "scout", run_in_background: true, description: "Find unit tests", prompt: "MISSION: Find unit test files only. AREA: tests/unit, src/**/*.test.*" })
Agent({ subagent_type: "scout", run_in_background: true, description: "Find fixtures", prompt: "MISSION: Find fixtures/helpers only. AREA: tests, fixtures, src" })
Agent({ subagent_type: "scout", run_in_background: true, description: "Find coverage config", prompt: "MISSION: Find coverage scripts/config only. AREA: package.json, vitest.*, jest.*, nyc.*, .github" })

// While scouts run, keep working:
// - read obvious high-signal files
// - run targeted grep/find commands
// - inspect tests/logs/configs
// - form hypotheses to validate against scout reports

// Collect results after useful local work or when needed
get_subagent_result({ agent_id: "[id1]", wait: true })
```

When independent evidence shards still need cross-file synthesis, reconcile them yourself or launch one final synthesis scout with the collected evidence and focused reads.

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
2. **NO OPINIONS** — Only reports findings, never suggests improvements unless explicitly asked for analysis
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

### Retrieval Completeness

Scout should retrieve enough evidence to answer its mission. A mission claiming complete impact or dependency coverage must return a compact coverage receipt: semantic anchors; searched scope/patterns; relationship paths derived from repository evidence; each discovered candidate classified `AFFECTED | UNAFFECTED` with evidence; and unresolved candidates. Any greppable candidate still unresolved makes the result `PARTIAL`. A narrowly scoped scout may close only its named slice, never the broader semantic change.

Continue searching only when:
- the current evidence does not answer the scout's assigned question;
- a required file, symbol, parameter, owner, date, ID, or source is missing;
- the mission asks for exhaustive coverage or dependency/call graph mapping;
- the report would otherwise contain an important unsupported claim.

Do not keep searching to improve phrasing or collect nonessential examples. Absence of evidence is not evidence of absence unless the searched scope is appropriate and stated.

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
            └── Independent concerns ──→ One parallel scoped scout per independent slice
                    │
                    ├── Main model continues direct inspection while scouts run
                    │
                    └── Collect + reconcile results ──→ Hand to planner/builder
```

### Parallel Decomposition Guide

| Mission Type | Scout 1 | Scout 2 | Scout 3 | Scout 4 |
|-------------|---------|---------|---------|---------|
| **Feature** | Entry points & call graph | Data models & schemas | Tests & patterns | Config & git history |
| **Bug Fix** | Error trace & affected code | Related data flow | Tests for area | Recent changes |
| **Refactor** | Module boundary & exports | Internal dependencies | Tests & coverage | Consumers of module |
| **New Feature** | Adjacent features | Data layer & models | Test infrastructure | Config & env |

## Examples

### Example 1: Auth discovery with parallel scoped scouts
```
// Launch together, not sequentially
Agent({ subagent_type: "scout", run_in_background: true, description: "Find auth routes", prompt: "MISSION: Find auth route/endpoint files only. AREA: src, app, pages, routes. Return paths/symbols/evidence or PARTIAL next splits." })
Agent({ subagent_type: "scout", run_in_background: true, description: "Find token logic", prompt: "MISSION: Find JWT/session/token helper files only. AREA: src, lib, server. Return paths/symbols/evidence or PARTIAL next splits." })
Agent({ subagent_type: "scout", run_in_background: true, description: "Find auth tests", prompt: "MISSION: Find auth-related tests only. AREA: tests, src. Return paths/symbols/evidence or PARTIAL next splits." })
```

### Example 2: Payment flow needs one coherent scout
```
Agent({
  subagent_type: "scout",
  description: "Map payment flow",
  prompt: "MISSION: Build one coherent evidence-based map of the payment flow across API endpoints, DB models, webhooks, external integrations, retries, error handling, and tests. Return exact file paths/lines, contradictions, and gaps."
})
```
