---
name: scout
description: Use the scout agent for codebase exploration, file discovery, and evidence gathering. Invoke when you need to find files, understand code structure, map dependencies, or gather context before planning or implementing. Scout is READ-ONLY — it never modifies code.
---

# Scout Skill — Codebase Exploration Agent

> **⚡ EFFICIENCY FIRST**: Scout has two delegated variants. Use `scout-highspeed` for most fast bounded exploration; use `scout` when you need the older checkpoint-heavy Kimi workflow or lower hallucination risk. Whenever the mission touches multiple areas, **split into parallel scouts** — do NOT explore sequentially.

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
| `scout-highspeed` | fast bounded file discovery, call/dependency maps, backend/infra/tests/config, algorithms/math/physics-heavy code understanding | frontend visual/design critique, broad unsupported factual research, whole-repo audits, exhaustive/stateful investigations, 6–8+ independent retrieval threads |
| `scout` | you need older checkpoint artifacts, lower hallucination risk, exhaustive coverage, or stronger large-context coherence | latency-sensitive parallel scans |

Default to `scout-highspeed` for bounded repo exploration. Use multiple highspeed scouts in parallel for independent angles. Switch to `scout` when one report must hold broad state across many areas.

## When NOT to Use

- **DO NOT** use scout for code modification (use builder)
- **DO NOT** use scout for writing plans (use planner)
- **DO NOT** use scout for trivial single-file lookups (use `read`/`grep` directly)
- **DO NOT** run scout sequentially if missions are independent — **ALWAYS parallelize**

## How to Invoke

### Default: Parallel Scouts (Recommended)

> **RULE**: If the mission has 2+ independent angles, launch **2-4 scouts in parallel**. Scout is cheap and fast — parallelizing saves time and reduces context overload per scout.

```
// Launch ALL in parallel — no waiting between them
Agent({ subagent_type: "scout-highspeed", run_in_background: true, description: "Find entry points", prompt: "..." })
Agent({ subagent_type: "scout-highspeed", run_in_background: true, description: "Map data models", prompt: "..." })
Agent({ subagent_type: "scout-highspeed", run_in_background: true, description: "Check tests", prompt: "..." })

// While scouts run, the main model should keep working:
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

Use a single scout ONLY when the scope is genuinely narrow (1 concern, 1 area):

```
Agent({
  subagent_type: "scout-highspeed",
  description: "[3-5 words]",
  prompt: "MISSION: [clear objective]\n\nFOCUS ON:\n- [aspect 1]\n- [aspect 2]\n\nAREA: [root paths]\n\nReturn a complete scout report with file paths, key findings, and evidence."
})
```

## Scout Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `subagent_type` | ✅ | `"scout-highspeed"` for fast default, `"scout"` for checkpoint/Kimi workflow |
| `description` | ✅ | Short 3-5 word summary |
| `prompt` | ✅ | Detailed mission with FOCUS ON and AREA |
| `run_in_background` | ✅ **Always `true` for parallel** | `true` when launching multiple scouts |
| `max_turns` | Optional | Default unlimited. Use 20-30 for quick scouts; keep highspeed scouts short to reduce context drift |

## Scout Behavior Rules

Scout agents follow these absolute rules:

1. **READ-ONLY** — Never modifies, creates, or edits files
2. **NO OPINIONS** — Only reports findings, never suggests improvements
3. **NO ASSUMPTIONS** — Says "NOT FOUND" if no evidence exists
4. **QUOTE EXACTLY** — Copies text verbatim from source
5. **EVIDENCE-BASED** — Every claim backed by file evidence

## Scout Output Format

Scout returns a structured report with:
- **Files Found**: Table of relevant files with paths and descriptions
- **Evidence**: Verbatim quotes from code or command output
- **Gaps**: What's missing or pending
- **Next Retrieval**: The smallest useful next search/read, if evidence is incomplete
- **Dependency Graph**: include when the mission is about architecture, call flow, imports, exports, or module relationships

### Retrieval Budget

Scout should retrieve enough evidence to answer its bounded mission, then stop. For `scout-highspeed`, prefer 5-12 tool calls and return `PARTIAL` rather than overextending. Continue searching only when:
- the current evidence does not answer the scout's assigned question;
- a required file, symbol, parameter, owner, date, ID, or source is missing;
- the mission asks for exhaustive coverage or dependency/call graph mapping;
- the report would otherwise contain an important unsupported claim.

If a highspeed scout mission grows into a large-codebase audit, 6–8+ independent retrieval threads, or a stateful exhaustive investigation, split it into multiple scouts or route to `scout`.

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

### Example 1: Find auth implementation
```
Agent({
  subagent_type: "scout-highspeed",
  description: "Find auth logic",
  prompt: "MISSION: Find all authentication-related code in this project.\n\nFOCUS ON:\n- Login/register endpoints\n- JWT/token handling\n- Middleware or guards\n- User model/schema\n\nAREA: src/\n\nReturn file paths, key functions, and how auth flows work."
})
```

### Example 2: Map before planning
```
Agent({
  subagent_type: "scout-highspeed",
  description: "Map payment flow",
  prompt: "MISSION: Map the complete payment processing flow.\n\nFOCUS ON:\n- API endpoints that handle payments\n- Database models for transactions\n- External service integrations (Stripe, etc.)\n- Error handling and retry logic\n\nAREA: src/payments/, src/api/, prisma/schema.prisma\n\nReturn a flow map with file references."
})
```

### Example 3: Parallel scouts for large refactor
```
// Launch 3 scouts in parallel
Agent({ subagent_type: "scout-highspeed", run_in_background: true, description: "Find exports", prompt: "MISSION: List all exports from src/utils/. What functions, types, constants are exported? Who imports them?" })
Agent({ subagent_type: "scout-highspeed", run_in_background: true, description: "Find tests", prompt: "MISSION: Find all test files for src/utils/. What testing framework? What coverage?" })
Agent({ subagent_type: "scout-highspeed", run_in_background: true, description: "Find usage", prompt: "MISSION: Find all files that import from src/utils/. Map internal and external consumers." })

// Collect and consolidate
get_subagent_result({ agent_id: "...", wait: true })
```
