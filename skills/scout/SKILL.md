---
name: scout
description: Use the scout agent for codebase exploration, file discovery, and evidence gathering. Invoke when you need to find files, understand code structure, map dependencies, or gather context before planning or implementing. Scout is READ-ONLY — it never modifies code.
---

# Scout Skill — Codebase Exploration Agent

> **⚡ EFFICIENCY FIRST**: Scout runs on a **fast, cheap model** (minimax/M2.7). It is ALWAYS the most cost-effective choice for exploration. Whenever the mission touches multiple areas, **split into parallel scouts** — do NOT explore sequentially.

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
Agent({ subagent_type: "scout", run_in_background: true, description: "Find entry points", prompt: "..." })
Agent({ subagent_type: "scout", run_in_background: true, description: "Map data models", prompt: "..." })
Agent({ subagent_type: "scout", run_in_background: true, description: "Check tests", prompt: "..." })

// Collect results after ALL are launched
get_subagent_result({ agent_id: "[id1]", wait: true })
get_subagent_result({ agent_id: "[id2]", wait: true })
get_subagent_result({ agent_id: "[id3]", wait: true })
```

### Single Scout (Only for Simple/Trivial)

Use a single scout ONLY when the scope is genuinely narrow (1 concern, 1 area):

```
Agent({
  subagent_type: "scout",
  description: "[3-5 words]",
  prompt: "MISSION: [clear objective]\n\nFOCUS ON:\n- [aspect 1]\n- [aspect 2]\n\nAREA: [root paths]\n\nReturn a complete scout report with file paths, key findings, and evidence."
})
```

## Scout Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `subagent_type` | ✅ | Always `"scout"` |
| `description` | ✅ | Short 3-5 word summary |
| `prompt` | ✅ | Detailed mission with FOCUS ON and AREA |
| `run_in_background` | ✅ **Always `true` for parallel** | `true` when launching multiple scouts |
| `max_turns` | Optional | Default unlimited. Use 20-30 for quick scouts |

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
- **Evidence**: Verbatim quotes from code
- **Gaps**: What's missing or pending
- **Recommendations**: What to explore next (not opinions, just next steps)

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
                    └── Collect results ──→ Hand to planner/builder
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
  subagent_type: "scout",
  description: "Find auth logic",
  prompt: "MISSION: Find all authentication-related code in this project.\n\nFOCUS ON:\n- Login/register endpoints\n- JWT/token handling\n- Middleware or guards\n- User model/schema\n\nAREA: src/\n\nReturn file paths, key functions, and how auth flows work."
})
```

### Example 2: Map before planning
```
Agent({
  subagent_type: "scout",
  description: "Map payment flow",
  prompt: "MISSION: Map the complete payment processing flow.\n\nFOCUS ON:\n- API endpoints that handle payments\n- Database models for transactions\n- External service integrations (Stripe, etc.)\n- Error handling and retry logic\n\nAREA: src/payments/, src/api/, prisma/schema.prisma\n\nReturn a flow map with file references."
})
```

### Example 3: Parallel scouts for large refactor
```
// Launch 3 scouts in parallel
Agent({ subagent_type: "scout", run_in_background: true, description: "Find exports", prompt: "MISSION: List all exports from src/utils/. What functions, types, constants are exported? Who imports them?" })
Agent({ subagent_type: "scout", run_in_background: true, description: "Find tests", prompt: "MISSION: Find all test files for src/utils/. What testing framework? What coverage?" })
Agent({ subagent_type: "scout", run_in_background: true, description: "Find usage", prompt: "MISSION: Find all files that import from src/utils/. Map internal and external consumers." })

// Collect and consolidate
get_subagent_result({ agent_id: "...", wait: true })
```
