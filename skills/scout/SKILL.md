---
name: scout
description: Use the scout agent for codebase exploration, file discovery, and evidence gathering. Invoke when you need to find files, understand code structure, map dependencies, or gather context before planning or implementing. Scout is READ-ONLY — it never modifies code.
---

# Scout Skill — Codebase Exploration Agent

> **⚡ EFFICIENCY FIRST**: Scout has two delegated variants. Use `scout-highspeed` for most fast bounded exploration; use `scout` when you need stronger coherent read-only synthesis or lower hallucination risk. Whenever the mission touches multiple areas, **split into parallel scouts** when decomposition preserves quality.

## When to Use

Invoke `Agent(subagent_type="scout-highspeed")` or `Agent(subagent_type="scout")` in these situations:

| Situation | Why Scout |
|-----------|-----------|
| **Need to find files** | "Where is the auth logic?" "Which files handle payments?" |
| **Understand code structure** | "How is this project organized?" "What are the entry points?" |
| **Map dependencies** | "What depends on this module?" "What does this service import?" |
| **Gather context before planning** | Before calling planner, send scout to explore relevant areas |
| **Debug — find root cause** | "Where is this error thrown?" "What code path leads here?" |
| **Verify patterns** | "Does this project use clsx or classnames?" "Is there a cn() utility?" |

## Agent Choice

| Agent | Use When | Avoid When |
|---|---|---|
| `scout-highspeed` | micro-scouts: narrow file discovery, symbol grep, one dependency/config/test slice, backend/infra/tests/config, algorithms/math/physics-heavy code understanding with tight scope | frontend visual/design critique, broad unsupported factual research, whole-repo audits, exhaustive/stateful investigations, corpus/coverage mapping in one prompt, 6–8+ independent retrieval threads |
| `scout` | you need lower hallucination risk, exhaustive coverage, contradiction resolution, or stronger large-context coherence | latency-sensitive parallel scans |

Default to `scout-highspeed` only after decomposing into micro-missions. Use many highspeed scouts in parallel for independent angles. Switch to `scout` when one report must hold broad state across many areas.

## Routing: Highspeed vs Normal vs Mixed

Choose based on whether decomposition preserves quality.

### Use mostly `scout-highspeed` when decomposition is clean
Use highspeed micro-scouts when the work can be split into independent slices and merged mechanically.

Good examples:
- file inventory by directory or glob;
- symbol/function lookup by name;
- test/config discovery;
- import/call-site grep;
- one module's local dependencies;
- comparing separate implementations of the same interface.

Pattern:
```ts
// Run all at once, in one assistant message, with run_in_background: true
Agent({ subagent_type: "scout-highspeed", run_in_background: true, description: "Find unit tests", prompt: "MISSION: Find unit test files only. BUDGET: <=2 tool rounds, <=8 tool uses, read <=3 files. AREA: tests/unit, src/**/*.test.*" })
Agent({ subagent_type: "scout-highspeed", run_in_background: true, description: "Find fixtures", prompt: "MISSION: Find fixtures/helpers only. BUDGET: <=2 tool rounds, <=8 tool uses, read <=3 files. AREA: tests, fixtures, src" })
Agent({ subagent_type: "scout-highspeed", run_in_background: true, description: "Find coverage config", prompt: "MISSION: Find coverage scripts/config only. BUDGET: <=2 tool rounds, <=8 tool uses, read <=3 files. AREA: package.json, vitest.*, jest.*, nyc.*, .github" })
```

### Use normal `scout` when splitting would lose coherence
Use `scout` when the answer needs one coherent mental model across many files, long state retention, contradiction resolution, or an exhaustive audit.

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

### Use mixed mode for broad investigations
Use highspeed scouts for cheap inventory/evidence shards, and one normal scout for synthesis when coherence matters.

Examples:
- Highspeed scouts: inventory test files, find config, grep target symbols, list fixtures.
- Normal scout: synthesize whether coverage matches requirements and identify gaps.

Pattern:
```ts
// Phase 1: parallel highspeed evidence shards
Agent({ subagent_type: "scout-highspeed", run_in_background: true, description: "Inventory tests", prompt: "MISSION: Inventory test files by directory only. BUDGET: <=2 tool rounds, <=8 tool uses, read <=3 files. Return counts, paths, and PARTIAL next splits." })
Agent({ subagent_type: "scout-highspeed", run_in_background: true, description: "Grep target APIs", prompt: "MISSION: Grep target API usages only. BUDGET: <=2 tool rounds, <=8 tool uses, read <=3 files. Return matching files/symbols." })
Agent({ subagent_type: "scout-highspeed", run_in_background: true, description: "Find coverage config", prompt: "MISSION: Find coverage config/scripts only. BUDGET: <=2 tool rounds, <=8 tool uses, read <=3 files." })

// Phase 2: normal scout only if synthesis still needs cross-file coherence
Agent({ subagent_type: "scout", description: "Synthesize coverage gaps", prompt: "Use the highspeed reports plus focused reads to determine coverage gaps. Preserve contradictions and cite exact evidence." })
```

## When NOT to Use

- **DO NOT** use scout for code modification (use builder)
- **DO NOT** use scout for writing plans (use planner)
- **DO NOT** use scout for trivial single-file lookups (use `read`/`grep` directly)
- **DO NOT** run scout sequentially if missions are independent — **ALWAYS parallelize**

## How to Invoke

### Default: Parallel Micro-Scouts (Recommended)

> **RULE**: If the mission has 2+ independent angles, launch **3-8 scouts in parallel**. `scout-highspeed` is a micro-scout; it should not receive corpus/coverage/exhaustive prompts. Parallelizing saves time and prevents context drift per scout.

```
// Launch ALL in parallel — no waiting between them
Agent({ subagent_type: "scout-highspeed", run_in_background: true, description: "Find entry points", prompt: "MISSION: Find entry files only. BUDGET: <=2 tool rounds, <=8 tool uses, read <=3 files. Return PARTIAL with next splits if broad. ..." })
Agent({ subagent_type: "scout-highspeed", run_in_background: true, description: "Map data models", prompt: "MISSION: Map model files only. BUDGET: <=2 tool rounds, <=8 tool uses, read <=3 files. Return PARTIAL with next splits if broad. ..." })
Agent({ subagent_type: "scout-highspeed", run_in_background: true, description: "Check test config", prompt: "MISSION: Find test config/scripts only. BUDGET: <=2 tool rounds, <=8 tool uses, read <=3 files. Return PARTIAL with next splits if broad. ..." })

// While scouts run, keep working:
// - read obvious high-signal files
// - run targeted grep/find commands
// - inspect tests/logs/configs
// - form hypotheses to validate against scout reports

// Collect results after useful local work or when needed
get_subagent_result({ agent_id: "[id1]", wait: true })
get_subagent_result({ agent_id: "[id2]", wait: true })
get_subagent_result({ agent_id: "[id3]", wait: true })
```

### Single Scout (Only for Simple/Trivial)

Use a single `scout-highspeed` ONLY when the scope is genuinely narrow (1 concern, 1 area, <=3 likely file reads). If the prompt contains words like `all`, `complete`, `corpus`, `coverage`, `inventory`, `entire`, or `map`, split first unless the area is tiny.

```
Agent({
  subagent_type: "scout-highspeed",
  description: "[3-5 words]",
  prompt: "MISSION: [one narrow objective]\n\nBUDGET:\n- max 2 tool-call rounds\n- max ~8 total tool uses\n- read <=3 files\n- return PARTIAL with next micro-scout splits if broad\n\nFOCUS ON:\n- [aspect 1]\n\nAREA: [specific root paths/patterns]\n\nReturn file paths, key findings, and evidence."
})
```

## Scout Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `subagent_type` | ✅ | `"scout-highspeed"` for fast default, `"scout"` for coherent/exhaustive workflow |
| `description` | ✅ | Short 3-5 word summary |
| `prompt` | ✅ | Detailed mission with FOCUS ON and AREA |
| `run_in_background` | ✅ **Always `true` for parallel** | `true` when launching multiple scouts |
| `max_turns` | Optional | Use 8-15 for `scout-highspeed` micro-scouts; use higher only for `scout` |

## Scout Behavior Rules

Scout agents follow these absolute rules:

1. **READ-ONLY** — Never modifies, creates, or edits files; normal `scout` also does not create checkpoint files on disk
2. **NO OPINIONS** — Only reports findings, never suggests improvements unless explicitly asked for analysis
3. **NO ASSUMPTIONS** — Says "NOT FOUND" if no evidence exists and states searched scope
4. **QUOTE EXACTLY** — Copies relevant source text verbatim when quoting code
5. **EVIDENCE-BASED** — Every claim backed by file evidence

## Scout Output Format

Scout returns a structured report with:
- **Files Found**: Table of relevant files with paths and descriptions
- **Evidence**: Verbatim quotes from code or command output
- **Gaps**: What's missing or pending
- **Next Retrieval**: The smallest useful next search/read, if evidence is incomplete
- **Dependency Graph**: include when the mission is about architecture, call flow, imports, exports, or module relationships

### Retrieval Budget

Scout should retrieve enough evidence to answer its bounded mission, then stop. For `scout-highspeed`, prefer 3-8 tool uses across <=2 tool-call rounds and return `PARTIAL` rather than overextending. Continue searching only when:
- the current evidence does not answer the scout's assigned question;
- a required file, symbol, parameter, owner, date, ID, or source is missing;
- the mission asks for exhaustive coverage or dependency/call graph mapping;
- the report would otherwise contain an important unsupported claim.

If a highspeed scout mission grows into a large-codebase audit, corpus/coverage mapping, 6–8+ independent retrieval threads, or a stateful exhaustive investigation, split it into multiple highspeed scouts or route to `scout`.

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
            ├── Simple mission (1 concern) ──→ Single scout
            │
            └── Complex mission (2+ concerns) ──→ Parallel scouts (2-4)
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

### Example 1: Auth discovery with highspeed micro-scouts
```
// Launch together, not sequentially
Agent({ subagent_type: "scout-highspeed", run_in_background: true, description: "Find auth routes", prompt: "MISSION: Find auth route/endpoint files only. BUDGET: <=2 tool rounds, <=8 tool uses, read <=3 files. AREA: src, app, pages, routes. Return paths/symbols/evidence or PARTIAL next splits." })
Agent({ subagent_type: "scout-highspeed", run_in_background: true, description: "Find token logic", prompt: "MISSION: Find JWT/session/token helper files only. BUDGET: <=2 tool rounds, <=8 tool uses, read <=3 files. AREA: src, lib, server. Return paths/symbols/evidence or PARTIAL next splits." })
Agent({ subagent_type: "scout-highspeed", run_in_background: true, description: "Find auth tests", prompt: "MISSION: Find auth-related tests only. BUDGET: <=2 tool rounds, <=8 tool uses, read <=3 files. AREA: tests, src. Return paths/symbols/evidence or PARTIAL next splits." })
```

### Example 2: Payment flow needs normal scout for coherence
```
Agent({
  subagent_type: "scout",
  description: "Map payment flow",
  prompt: "MISSION: Build one coherent evidence-based map of the payment flow across API endpoints, DB models, webhooks, external integrations, retries, error handling, and tests. Return exact file paths/lines, contradictions, and gaps."
})
```

### Example 3: Parallel scouts for large refactor
```
// Launch 3 scouts in parallel
Agent({ subagent_type: "scout-highspeed", run_in_background: true, description: "Find util exports", prompt: "MISSION: List export declarations in src/utils only. BUDGET: <=2 tool rounds, <=8 tool uses, read <=3 files. Return export paths/symbols; PARTIAL if broad." })
Agent({ subagent_type: "scout-highspeed", run_in_background: true, description: "Find util tests", prompt: "MISSION: Find test files for src/utils only. BUDGET: <=2 tool rounds, <=8 tool uses, read <=3 files. Return paths/framework evidence; PARTIAL if broad." })
Agent({ subagent_type: "scout-highspeed", run_in_background: true, description: "Find util imports", prompt: "MISSION: Grep imports from src/utils only. BUDGET: <=2 tool rounds, <=8 tool uses, read <=3 files. Return consumer paths; PARTIAL if broad." })

// Collect and consolidate
get_subagent_result({ agent_id: "...", wait: true })
```
