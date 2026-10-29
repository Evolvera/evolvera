# Installation and Operations Guide

A standardized [PI Coding Agent](https://github.com/badlogic/pi) harness for working in the terminal and VS Code with agents, skills, extensions, and tools shared by the team.

The main PI remains responsible for the outcome. It reads the request and harness rules, decides whether to act directly or delegate, gathers repository evidence, implements the smallest sufficient change, and validates the result.

```text
User
  → Main PI + SYSTEM.md
    → direct action or specialized agent
      → tools / code / runtime
        → validation and outcome
```

## Quick Start

### Prerequisites

- Git;
- access to the private `Evolvera/evolvera` repository;
- GitHub CLI (`gh`) or another way to clone the repository;
- Node.js `>=22.19.0`;
- npm available on `PATH`;
- credentials for at least one AI provider.

The default baseline installed by the scripts is `@earendil-works/pi-coding-agent@1.4.0`. The patches described below are verified for this version; override-selected versions without proven compatibility fail closed.

### Node with fnm (Linux and macOS)

Before running `./install.sh` in a new shell, install and persist fnm, select the validated target, and verify Node. The locally validated target is fnm 22.22.3:

```bash
# Add the installer's output to your shell when prompted
curl -fsSL https://fnm.vercel.app/install | bash
# ~/.zshrc (macOS):
eval "$(fnm env --use-on-cd --shell zsh)"
# ~/.bashrc (Linux):
eval "$(fnm env --use-on-cd --shell bash)"
fnm install 22.22.3
fnm default 22.22.3
fnm use 22.22.3
node --version  # v22.22.3
```

Open a new shell, confirm `node --version` reports `v22.22.3`, and only then run `./install.sh`.

### Linux and macOS

```bash
gh auth login
gh repo clone Evolvera/evolvera
cd evolvera

./install.sh

pi
/login
```

#### Windows Screenshots in PI Running Under WSL

In Warp for Windows, `Ctrl+V` may be consumed by the terminal before it reaches PI in WSL. Under WSL, setup adds `Alt+V` as an alternative shortcut without removing `Ctrl+V`: use `@` + `Alt+V` to insert the temporary path for a screenshot captured with `Win+Shift+S`.

`install.sh` installs `~/.pi/agent/keybindings.json` only under WSL and only when the destination does not already exist. On macOS and native Linux, the installer does not create this file and PI defaults remain unchanged. Existing custom settings, including symbolic links, are preserved. This addresses passing the shortcut from the terminal to PI; it is not a fix for every terminal.

### Windows

```powershell
gh auth login
gh repo clone Evolvera/evolvera
Set-Location evolvera

# If needed:
nvm install 22.19.0
nvm use 22.19.0
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

.\install.ps1

pi
/login
```

If the local policy still blocks the installer:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

### Verify the Setup

Close and reopen the terminal after the first installation. Then verify:

```bash
pi --version
node --version
```

Linux/macOS:

```bash
test -f "$HOME/.pi/agent/SYSTEM.md"
test -d "$HOME/.pi/agent/agents"
test -d "$HOME/.pi/agent/skills"
test -d "$HOME/.pi/agent/extensions"
```

Windows:

```powershell
Test-Path "$HOME\.pi\agent\SYSTEM.md"
Test-Path "$HOME\.pi\agent\agents"
Test-Path "$HOME\.pi\agent\skills"
Test-Path "$HOME\.pi\agent\extensions"
```

In PI, use `/reload` after changing agents, skills, extensions, or configuration.

## What the Installer Does

The repository checkout is the versioned source. The user's runtime is in `~/.pi/agent` (`$HOME\.pi\agent` on Windows).

Os instaladores:

1. check for Node.js `>=22.19.0`;
2. install the configured version of `@earendil-works/pi-coding-agent`;
3. create the runtime directories;
4. copy the versioned configuration to `~/.pi/agent`;
5. copy agents, skills, regular extensions, and themes; `extensions/plastic-memory/` is not installed while its compaction path is disabled;
6. install only the configured PI packages (Goal Mode and helper integrations); the configuration template does not enable `plastic-memory` or `pi-observational-memory`;
7. create `mcp.json` only if it does not already exist;
8. write `settings.json` last, after all resources have been prepared. The template sets `compaction.reserveTokens: 65536` to begin compaction with more headroom before the output limit.

### PI 1.3.0/1.4.0 Continuation Patch

After the global `npm install` and before verifying the installation or activating `settings.json`, the installers run `scripts/patch-pi-threshold-cancel.mjs`. The patcher validates the exact name/version, path, cardinality, and SHA-256 of the known anchor, then changes only auto-compaction cancellation for `reason === "threshold"`: already queued messages can continue. Overflow cancellation, manual compaction, and the success path remain unchanged.

Unknown versions, content, or cardinalities are rejected without replacing the file. The operation is idempotent, atomic, and preserves the file mode. Safe verification uses only a temporary disposable synthetic fixture:

```bash
node scripts/test/patch-pi-threshold-cancel.smoke.mjs
```

PI 1.3.0 already loads credentials asynchronously before using them and recovers context-length (`length`) cuts through the native compaction-and-retry path. The old patches `patch-pi-083-auth-load-recovery.mjs` and `patch-pi-083-context-wall-retry.mjs` are no longer run by the installers. The continuation patch remains necessary when an extension cancels threshold compaction with messages queued; it does not resume explicit aborts, overflow, or ordinary failures.

### `ultra` Thinking in PI 1.3.0/1.4.0

The installers run `scripts/patch-pi-ultra-thinking.mjs` immediately after the continuation patch and `scripts/patch-pi-subagents-ultra-thinking.mjs` after installing `@tintinweb/pi-subagents@0.18.2`. The patchers add `ultra` to the type, CLI, level catalog, model schema, TUI, and subagent surfaces. The value appears only for models whose `thinkingLevelMap` declares support; `models.json` enables `ultra: "ultra"` for `openai-codex/gpt-6-astra`.

In the TUI, `ultra` uses two optional colors, `thinkingUltra` and `thinkingUltraAlt`, alternating every 350 ms. Older themes remain valid: both fall back to `thinkingMax` and then `thinkingXhigh`. Built-in themes use colors more intense than `max` and close to each other.

The runtime patch `scripts/patch-pi-subagents-bounded-waits.mjs` limits each subagent's total execution to 30 minutes, or 60 minutes when its exact type is `planner`; briefers and other planner types get 30 minutes. The deadline starts when work actually begins, does not count queue time, applies to new and resumed executions (including nested ones), and cancels the session through `AbortSignal`. A timeout preserves the partial result and worktree for manual resumption; there is no automatic restart or environment option to raise the limits. `bash` remains limited to 300 seconds by default and up to 1800 seconds when explicitly set; `get_subagent_result(wait: true)` continues waiting for at most 60 seconds without stopping the work. These are independent limits. The patch is installed with the other package patches; restart PI after applying it to load the updated runtime.

Changes fail closed by name/version/cardinality, are idempotent and atomic per file, and are prepared with rollback. Validation without stateful resources:

```bash
node scripts/test/patch-ultra-thinking.smoke.mjs
```

### Todo and Subagent HUD Panels

The installers run `scripts/patch-rpiv-todo-hud.mjs` after installing `@juicesharp/rpiv-todo@2.11.0` and `scripts/patch-pi-subagents-hud.mjs` after the bounded-timeout patch for `@tintinweb/pi-subagents@0.18.2`. Both restyle panels above the editor to match the footer (a `▌` rail, single-cell glyphs, `━` progress bar, no tree connectors), using only red, orange, white, and gray theme tokens (`accent`, `warning`, `thinkingXhigh`, `text`, `muted`, `dim`, `borderMuted`). This is presentation only: state, line budget, `/todos`, widget modes, and overflow calculation remain as upstream; the colored per-agent badge does not appear in the widget. Both fail closed by name/version/cardinality, are idempotent and atomic, and compose with the other package patches; restart PI after applying. Validate on disposable copies without touching installed packages:

```bash
node scripts/test/patch-rpiv-todo-hud.smoke.mjs
node scripts/test/patch-pi-subagents-hud.smoke.mjs
```

### Gemini Browser OAuth Login

The template installs `pi-antigravity@0.10.0`, an unofficial OAuth provider for Google browser login (no API key required). After installing or updating, use `/reload` and `/login antigravity`, complete browser consent, run `/antigravity.refresh`, and check `/antigravity.models` to choose a model announced by the server. This does not change the provider or default model. Gemini 3.8 is included in Pro; Argon requires an Ultra or Enterprise plan.

When the account lists `gemini-4-argon`, select `/model antigravity/gemini-4-argon`. The override in `config/models.json` adjusts this discovered model to a unified 1,048,576-token context and 65,536 synchronous output, as described in the [Argon documentation](https://ai.google.dev/gemini-api/docs/models/gemini-4-argon). It does not create a model missing from the catalog, invent reasoning variants, or grant access on the Pro plan. Availability and the actual response must be verified after login.

This flow uses third-party OAuth, not an official Google flow. Antigravity's terms, section 6, prohibit third-party OAuth, and use may result in account suspension: https://antigravity.google/terms. Credentials must not be committed to Git.

### Claude Fable 5.1 OAuth Compatibility

The template installs `npm:@gotgenes/pi-anthropic-auth@2.0.6`. After that installation and before the final activation of `settings.json`, the installers run `scripts/patch-anthropic-client-version.mjs`. The patcher is limited to the `@earendil-works/pi-coding-agent@1.3.0` and `1.4.0` baselines and `@gotgenes/pi-anthropic-auth@2.0.6` or adapted `2.0.1` installation (preserved without reinstalling), changing only known anchors to report Claude Code `2.1.280`. This is required because Opus 5.5 OAuth requires Claude Code `2.1.280+` (Fable 5.1 required `2.1.251+`); the patch fixes PI and OAuth adapter compatibility headers and does not depend on updating the standalone CLI.

Installations already carrying a value written by an earlier version of this patcher (`2.1.257`) are migrated to the current target with the same identity, cardinality, and rollback checks; any other value remains rejected. After applying the patch, restart the PI session so the already-loaded module is replaced.

The operation fails closed, is idempotent and atomic per file, is rollback-safe across both targets, and preserves file mode and bytes outside the anchors. Validate only with the disposable fixture:

```bash
node scripts/test/patch-anthropic-client-version.smoke.mjs
```

### Orca Lag with PI 1.2.0/1.3.0/1.4.0 in Fullscreen

In `@earendil-works/pi-coding-agent@1.2.0`, the fullscreen renderer writes each line as `ESC[<line>;1H ESC[2K <text>`. Orca's main-process tail parser (1.4.192) drops `H` but retains `ESC[2K`; the virtual column never returns to 0, each line is filled to the cumulative width of previous lines, and trimming `/[ \t]+$/` becomes quadratic. This cost Orca's main thread ~86 ms (up to ~172 ms) per PI frame and stalled input/output for all Orca terminals.

`scripts/patch-pi-tui-orca-redraw.mjs` inserts `\r` before each absolute cursor position in `pi-tui/dist/tui-alt-screen.js`. `CR` followed by `CUP` leaves screen and cursor identical in a real terminal (validated cell-by-cell with `@xterm/headless`), and Orca cost drops to ~0.1 ms per write. The patcher supports the 1.2.0, 1.3.0, and 1.4.0 baselines by exact hash, is idempotent and atomic, and rejects unknown content; other versions are skipped. Both installers run it after installing PI. Already-open sessions keep the previous runtime until restarted:

```bash
node scripts/patch-pi-tui-orca-redraw.mjs
node scripts/test/patch-pi-tui-orca-redraw.smoke.mjs
```

### Activation, Collisions, and Updates

Activation is deferred and collision-aware when the extension is manually made available in the runtime. Valid, enabled `plastic-memory` configuration with no effective OM package gives plastic-memory the sole full owner. Missing, invalid, or disabled configuration, or the effective presence of `npm:pi-observational-memory`, keeps the bridge context-only and does not install full hooks; there is no implicit cutover. Current installers do not copy the extension or activate its configuration.

When rerunning the installer, versioned resources are prepared first and activating configuration is written last:

- `settings.json`, `models.json`, `SYSTEM.md`, `subagents.json`, and `pi-goal.json`;
- versioned agents and skills;
- root-level extension files; `extensions/plastic-memory/` is deliberately excluded while the compaction path is disabled;
- versioned themes.

Active configuration in `~/.pi/agent/settings.json` changes only when the installer runs. Old OM package files or directories already at the destination remain inert; the installer does not delete them or perform a generic uninstall. The update neither promises nor performs memory migration.

The `native-compaction-routing.ts` extension routes native compaction for manual, threshold, and overflow triggers to `openai-codex/gpt-6-luna` at `medium` (measured: ~2.5× faster than `xhigh`, with equivalent quality), without changing the conversation model and while preserving SDK preparation and results. If Luna fails (missing model/authentication, provider outage, or invalid result), the conversation's main model performs compaction with a warning; only if both fail, or on abort, is compaction canceled with history intact. After changing the extension, use `/reload`; with extensions disabled or the extension absent, default native compaction remains responsible. The extension's public context does not expose the session stream/retry, so this route uses `compact` defaults for those optional arguments without inventing a prompt, changing global configuration, or rewriting the provider. User instructions in `/compact` are preserved. Do not enable another handler that replaces compaction at the same time, such as full Plastic Memory mode. Plastic Memory also uses `openai-codex/gpt-6-luna` (`medium`); old explicit `gpt-5.6-luna` settings are accepted and converted in memory, without editing persisted settings.

#### Safe Cutover During Flow Update

During the transition, `install.sh` (Linux/macOS) and `install.ps1` (Windows) stop before any mutation when the checkout contains `skills/flow-orca` and the runtime still contains the legacy skill at `~/.pi/agent/skills/flow` (on Windows, `$HOME\.pi\agent\skills\flow`). This prevents both skills from being discovered together.

In that case, preserve campaign data in `.pi/flow`; it is not the legacy skill. Also preserve the legacy directory and move it manually outside the skill-discovery tree, for example to a backup folder outside `~/.pi/agent/skills` (or `$HOME\.pi\agent\skills` on Windows). No installer automatically deletes or moves this directory. Then rerun your platform's installer.

### What Is Preserved

- local authentication;
- sessions and history;
- runtime files without a name collision;
- `~/.pi/agent/mcp.json` if it already exists.

This means changing `config/mcp.json` does not automatically replace the MCP configuration of an existing installation. Update that file deliberately in the runtime.

### Platform Differences

Windows also installs `pi-provider-kimi-code`. The scripts use `@earendil-works/pi-coding-agent@1.4.0` by default; the baseline can be explicitly overridden for controlled tests:

```bash
PI_CODING_AGENT_VERSION=1.4.0 ./install.sh
```

```powershell
$env:PI_CODING_AGENT_VERSION = "1.4.0"
.\install.ps1
```

## Use with VS Code

Install [PI for VS Code](https://marketplace.visualstudio.com/items?itemName=pi0.pi-vscode) from the Marketplace.

### First Use

1. In VS Code, open the project folder where PI should work.
2. Open the Command Palette.
3. Run **`Pi: Open`** or press `Ctrl+Alt+3`.
4. PI opens in an integrated terminal beside the editor.
5. Run `/login` if no provider is authenticated yet.
6. Send your request as usual.

The extension also provides:

- **Pi: Open with File** — opens PI with the current file and position;
- **Pi: Send Selection** — sends the editor selection;
- a **PI** button in the status bar;
- the `@pi` participant in VS Code Chat;
- a bridge for selection, open files, diagnostics, symbols, definitions, references, hover, code actions, formatting, and notifications.

### If VS Code Cannot Find `pi`

Find the executable path:

```bash
command -v pi
```

```powershell
(Get-Command pi).Source
```

In VS Code, set `pi-vscode.path` to the returned absolute path and run **Developer: Reload Window**.

### Confirm That the Bridge Works

Open a project file and ask PI, for example:

```text
show the diagnostics for the file open in VS Code
```

or select some text and ask:

```text
explain the current selection
```

PI should be able to use the `vscode_*` tools provided by the extension.

> **Compatibility:** in `pi-vscode` 0.0.9, do not use **Upgrade Pi and Packages**. That command installs the `@mariozechner/pi-coding-agent` package family, while this harness uses the `@earendil-works/pi-coding-agent` fork. Use the [safe-update skill](../skills/self-update/SKILL.md), which stages the compatible fork and harness together; do not use the installer as an update fallback.

## How the Harness Works

### Main Surfaces

| Surface | Responsibility |
|---|---|
| `config/SYSTEM.md` | Global policy, security, workflow, and routing rules installed as `~/.pi/agent/SYSTEM.md`. |
| `agents/*.md` | Subagent definitions: model, thinking, tools, and operating contract. |
| `skills/*/SKILL.md` | Procedures loaded when the task type requires that workflow. |
| `extensions/` | Commands, tools, and hooks run by the PI runtime; installers copy only flat files while `plastic-memory` is disabled. |
| `extensions/project-memory.ts` | Context-only compatibility bridge for the flat memory surface. |
| `config/settings.json` | Default provider/model, thinking, theme, and packages; does not enable `plastic-memory` or the OM package. |
| `config/models.json` | Available model catalog and overrides. |
| `subagents.json` | Subagent concurrency limit. |
| `config/mcp.json` | Initial MCP configuration; currently declares no servers (`mcpServers` is empty). |
| `.pi/` inside a project | Plans, memory, previews, recovery, and other local artifacts for that project. |

There is no `config/AGENTS.md` in this harness. Active routing is distributed across `SYSTEM.md`, skills, and agent definitions.

### Agent, Skill, Extension, and MCP

- **Agent:** an executor with its own model, tools, and responsibility. The main PI delegates a bounded mission.
- **Skill:** an operating manual. Defines when and how to run a workflow; it is not a separate process by itself.
- **Extension:** TypeScript code loaded by PI to add tools, commands, or runtime hooks.
- **MCP:** an external integration that exposes tools through a separate server.
- **System prompt:** the global contract the main PI uses to decide scope, security, delegation, and validation.

### Routing

Users normally describe the desired outcome; they do not need to choose an agent manually. PI chooses the lightest path that preserves correctness:

```text
trivial change with a known target
  → direct action

codebase investigation
  → scout

complex or cross-cutting change
  → planner → builder(s)

bounded implementation
  → builder suited to the work

independent evidence required
  → post-build test and/or validator

app evidence on an emulator/simulator
  → app-validator skill: scout investigates → builder maintains harness → app-validator validates device

website
  → dedicated website workflow or Home Preview
```

Agents do not replace the main PI: the orchestrator remains responsible for scope, integration, diff review, validation, and delivery.

### Anthropic Policy

In the default context mode, native Anthropic models with a 1M window are capped at **450K** at runtime, without changing `maxTokens` or the output limit (Opus 5.5 remains at 128K).

`/context-mode` opens the **Default / High** selector. It also accepts `/context-mode high`, `/context-mode default`, and `/context-mode status`. The `extensions/context-mode.ts` extension is the sole owner of this policy:

- **Default:** preserves each model's effective normal window and the Anthropic 450K cap.
- **High:** uses **800K** for GPT ≥ 6 and Claude ≥ 5 from providers `openai-codex`, `openai`, and `anthropic`; other models retain their normal window.
- **Conductor:** reduces the normal post-policy or High window by 30%, rounding down. Thus, 300K becomes 210K, native Claude 1M (normally 450K) becomes 315K, and High 800K becomes 560K. `standard` restores the normal window; reductions do not stack.
- The `contextMode` preference is saved in global `settings.json`; conductor mode applies only to the current session, determined by the `/orchestration` session entry, and is not inferred in workers, subagents, or new sessions. Mode changes update the active window immediately.
- The window controls compaction and the footer `ctx` meter; status shows effective capacity (for example, `◈315K` or `◈560K`), not a nominal High value. Conductor mode also appears as compact `CONDUCTOR` in the footer. The compaction reserve still applies, so the entire window is not available for history.

High does not increase the provider's actual capacity or guarantee that every route accepts 800K. More context can increase cost and latency; output limits remain unchanged.

Approved routes for Opus 5.5 are:

- `agents/builder-design.md` — `anthropic/claude-opus-5-5`, `medium`;
- `agents/builder-heavy-design.md` — `anthropic/claude-opus-5-5`, `high`;
- `agents/website-designer.md` — `anthropic/claude-opus-5-5`, `xhigh`;
- `agents/plan-briefer-fable.md` — `anthropic/claude-opus-5-5`, `high`.

### Discover the Active Configuration

Avoid maintaining counts and model tables manually. Consult the versioned definitions:

```bash
# Agents available in the checkout
find agents -maxdepth 1 -type f -name '*.md' -print | sort

# Each agent's model and thinking level
for file in agents/*.md; do
  echo "--- $file"
  sed -n '1,16p' "$file" | grep -E '^(display_name|model|thinking):'
done

# Skills
find skills -mindepth 1 -maxdepth 1 -type d -print | sort

# Extensions
find extensions -maxdepth 1 -type f -name '*.ts' -print | sort
```

In the installed runtime, replace relative paths with `~/.pi/agent/...`.

## Daily Use

Describe the outcome and relevant constraints to PI:

```text
Fix the authentication error and run the affected test.
```

```text
Explain why this query fails when the suite runs in parallel.
```

```text
Plan this integration without changing the current public contract.
```

```text
Implement task 04, validate it, and leave the diff ready for review.
```

```text
Review this PR only against the approved scope.
```

PI should investigate the repository before asking factual questions the code can answer. Destructive actions, deployment, force push, merge, purchases, and ambiguous security changes still require explicit authorization.

### Authorization Modes

Execution behavior is owned at runtime by `extensions/execution-mode.ts`, not by chat memory or a textual promise from the model. The extension persists the choice and automatically injects only the active mode, plus the shared continuation/authority contract, into every PI session that loads it—including custom prompts and Orca PI workers. Custom agents with `extensions: false` do not receive this hook; their bounded handoffs continue to carry mode and scope through the `agent-guide`/`builder` contract.

Use `/execution-mode` to open the selector, or `/execution-mode <supervised|autonomous|yolo> [global|project|session]`; aliases `SUPERVISIONADO`, `AUTÔNOMO`, and `AUTÔNOMO ATÉ PR` are accepted, and persisted values are `supervised`, `autonomous`, and `yolo`. The default scope is `global`; verified precedence is `session > trusted project > global > autonomous`. `/execution-mode status` and each save display `EXECUTION_MODE={"mode":"…","source":"…"}`. A missing value resolves to `autonomous`; invalid configuration fails safe to `supervised` with a sanitized diagnostic and a receipt marked `valid:false`, never a valid dispatch confirmation. The session pin uses native entries outside model context; in a new session, the SDK stores those entries alongside the first assistant response. Flow checks the pin before each dispatch, including after resumption. `SYSTEM.md` (mirrored in `config/SYSTEM.md`) retains permanent authority, security, and the pointer to this runtime owner.

| Mode | What it covers | Where it stops |
|---|---|---|
| `SUPERVISIONADO` | You approve each proposed stage or effect | Before each new stage; commands within an already approved stage are not re-approved |
| `AUTÔNOMO` (**default**) | Carry the authorized outcome through evidence, in-scope work, safe validation, and delivery | No invented final external effect; authorized software delivery proceeds to the PR and stops before merge |
| `YOLO` | Broader closeout authority within task scope, including merge after independent review of the final head SHA and checks | Deployment, migration, and other consequential operations only when separately named and approved |

`AUTÔNOMO` is the default when you have not requested another mode. PI does not ask for the same authorization again while the action, target, method, limits, and evidence remain unchanged—changing phase, tool, or agent does not expire approval. The PR boundary applies only to actual software delivery: an explanation, review, plan, or draft request ends with the requested artifact, without inventing a PR, publication, or send. Evidence and security gates are separate from mode: destructive actions, non-disposable resources, deployment, migration, credentials, and stateful tests still require their exact gates; no mode bypasses runtime controls.

### Issue Delivery with Flow Orca

Backlog → issues → PR delivery uses one skill, `flow-orca`, which replaces the former `flow`. PI should load it automatically for issue/board campaigns and coordination of PI issue workers in Orca worktrees; there is no need to name it. Simple worktree creation, unsupervised handoff, and standalone explanations remain outside this workflow. Explicit invocation is also available:

```text
/skill:flow-orca
User: [list] — create the issues and run the campaign
```

At campaign intake, the already-resolved global mode is reused (without a separate mode prompt), but PI still requests an explicit, scoped campaign grant—the default alone does not authorize a campaign:

- the **base branch per repository** (never assume `main`; multi-repository campaigns use one base per repo);
- the campaign **mode**: `SUPERVISIONADO` approves each issue start, commit, push, and PR; `AUTÔNOMO` (legacy alias accepted: `AUTÔNOMO ATÉ PR`) covers scheduling, workspaces, implementation, commit, push, and PR; `YOLO` adds merge, only after independent review of the final head SHA and required checks, and covers deployment/migration only when those operations are separately named and approved. `YOLO` is approval scope, never a security bypass.

**GitHub is the source of truth.** The campaign grant (scope, bases, mode, ceiling, named operations, and approval provenance) lives in a `## Campaign grant` section of the GitHub Project's own README, preserving its other text; acceptance criteria, scopes, and dependencies (always a full issue URL plus gate) live in each issue body; progress, blockers, and results live in comments. This remote record is evidence of approval you already gave—it does not authorize itself or disable any security gate. There is no control issue, parallel backlog, or local delivery plan/DAG/state: execution order is derived in memory at each GitHub reread, and an old `.pi/flow/` folder is optional history only, with no authority.

During the campaign, each issue gets an Orca workspace, a real branch created by Orca, and a PI session. Orca Run/Task/Dispatch records supervise **one attempt** for an admitted issue; they are never a second work queue. The scheduler runs continuously with a ceiling of **twelve** simultaneous PI issue workers; a slot returns only when that worker settles safely—timeouts or idle terminals do not free it. The board uses `Backlog`, `Ready`, `In progress`, `In review`, `Blocked`, and `Done`; `Blocked` is additive on existing boards and receives issues with external dependencies (credentials, access, human decisions) and their dependents. Every status is updated **and reread**, and `Done` requires a PR with a real `mergedAt` on the selected base, checks/review, a closed issue, and a reread status—`worker_done`, an open PR, or a closed PR without a merge is not `Done`. Completion arrives through the Run inbox and Orca's native notification to the idle coordinator: no polling or monitoring loop. The notice only wakes PI, which reads the full batch, reconciles IDs, and confirms Delivery; without proven support, automatic return remains unverified and the manual alternative must be explicit. After verified merge/`Done` and Task/Goal/terminal settlement, the coordinator removes the disposable issue worktree only when specific authority and identity, content, and recovery gates are proven; otherwise it retains it with a reason. Removal may also delete the **local** branch, ends workspace terminals, and removes its history: required results and recoverable commits must be outside it first. No `--force`, archive hooks, user data, unrelated resources, or cleanup as incident recovery.

This harness version includes the skill and policy verified **statically** (skill validation, contract smokes, mirrors, and architecture). No live campaign, Orca operation, GitHub mutation, or deployment was performed here; this is not live campaign certification.

### Useful Commands

| Command | Usage |
|---|---|
| `/login` | Authenticate or select a provider/model. |
| `/reload` | Reload configuration, agents, skills, and extensions after changes. |
| `/communication-mode` | Select the communication style (default, default+caveman, or caveman). |
| `/execution-mode` | Select the execution mode (supervised, autonomous, or yolo). |
| `/orchestration conductor` / `standard` / `status` | `conductor` turns the main session into a sub-PI coordinator and reduces its context window by 30% from post-policy capacity (`default` or `High`). `standard` restores the normal window. This is per-session; workers, subagents, and `/new` do not inherit conductor. The prompt swaps only the `SYSTEM.md` block; skills, memory, and execution mode remain. Conductor also pins reasoning to `medium` for the session and re-applies it on every turn, session resume, and model change, resetting any different selection; `standard` leaves the chosen effort untouched. If `SYSTEM.md` loses a required section, it returns to the default with a warning. |
| `PI_REPORT_RUN` | In an Orca worker, set the conductor's `run_…` ID: when `/goal` is accepted as complete or blocked, the extension reads the Run coordinator terminal (`coordinator_handle`) and types a `[child <worktree>] goal finished/blocked …` line into it, waking the conductor. Without a valid ID, it sends nothing; a failure gets one retry at turn end. |
| `/attention` | Manage idle notifications for the main agent. |
| `/fast on` / `/fast eco` / `/fast ultra` / `/fast ultra-eco` / `/fast off` / `/fast eco default on\|off` | Fast is disabled by default; `eco` enables Fast only for eligible OpenAI Codex subagents (`service_tier: "priority"`) in the current session. `eco default on\|off` saves the global preference in `settings.json`, applied only to future TUI launches; the default is `off`. `on` enables Fast for the main agent and eligible subagents; `ultra`/`ultra-eco` do the same as `on`/`eco` but request `service_tier: "ultrafast"` for `gpt-6-astra` or `gpt-6.1-sol` (the only Ultrafast models; requires Pro $500 or eligible Enterprise/Edu, 8× the included limit / 6× credits) and Fast for other models; `off` disables Fast for all. The selected mode survives model changes: with a model that lacks Fast for the main agent (e.g. Claude), `on`/`ultra` still apply to eligible subagents (status `⚡SUB`/`🚀SUB`). The explicit mode continues into the new root chat created by `/new`; isolated subagents remain on the default tier. |
| `/goal <criterion>` | Maintain a completion criterion across turns. |
| `/goal status` | View Goal Mode status. |
| `/goal clear` | End Goal Mode. |
| `/memory:status` | Show project memory status and mode. |
| `/memory:view` or `/memory:view full` | Show the injected context block (summary/indexes). |
| `/om:status` | Alias for the current active memory surface; context behavior equivalent to `/memory:status`. |
| `/om:view` or `/om:view full` | Alias for the current active memory surface; context behavior equivalent to `/memory:view`. |

The **Acid Shellscape** intro combines an enlarged, layered landscape with ambient motion and a video-game-style profile selector. In the managed TUI, the landscape appears between notifications and the editor and disappears when the conversation starts; it is not sent to the model. The artwork contains no PI branding: only a profile whose display name is `evolvera` (case-insensitive, with surrounding whitespace ignored) shows a Japanese ship with the Evolvera flag. To preview it on this branch without installing or accessing real accounts, run `node scripts/preview-terminal-art.mjs --select`; `--no-animation` shows the complete static composition. See [design, limitations, and tests](../docs/terminal-art.md).

During an active terminal response, the `working-time.ts` extension replaces the default message with a `Working for …` counter. The timer resets at each `turn_start` and is cleared at `turn_end`, so it measures the current response rather than the whole session. When the request has a `todo` list, the same line adds the request time, items done/total, and once one item is done an estimate of the time left from the average per finished item (`Working for 12s · pedido 3m 40s · 2/5 itens · faltam ≈ 6 min`); no model call is made for it.

`todo-reconciliation.ts` injects transient reminders before the final response after a new request, post-review work, or completed/failed delivery by a subagent started by the main PI in this session. A successful list/mutation clears the need until more work occurs; a read-only list is enough if nothing needs changing. It may request one corrective round, which can add a model call. It reads the branch's latest `todo` result; it never marks tasks complete or treats a listing as semantic proof. It is not a final veto, and models may ignore the reminder. Use `/reload` to activate it after installation or changes.

`/goal` is provided by `@narumitw/pi-goal`: it keeps per-session state and ends only through the explicit `goal_complete` tool or `goal_blocked` with evidence. The default installation does not limit automatic continuations (`continuationLimits.automaticTurns: null`), but pauses after three consecutive turns without progress; use `/goal pause`, `/goal resume`, or `/goal clear` to control the cycle.

Canonical operations use `memory_recall` (exact `pm:p:`/`pm:c:` ID) and `memory_search` (bounded filters; metadata/snippets). `/memory:status` and `/memory:view [visible|full]` show status/context, with aliases `/om:status` and `/om:view [visible|full]`. In the checked-in root, `/memory:propose`, `/memory:accept`, `/memory:migrate`, `/memory:backfill`, and `/memory:retry` return `unavailable`: they do not publish, migrate, run backfill/retry, or call a provider.

Semantic safety is conservative: each cycle is one contiguous completed turn of up to approximately 100k tokens, without multipart and with at most one automatic retry; 10k/20k are inspection triggers. Six closed cycles use identity-based stride, compacting the two oldest and preserving the four most recent. A detached result is applied only after `settled`/idle, with no pending messages and with host guards; an invalid or mismatched internal attempt cancels. A manual, threshold, or overflow no-match preserves the native fallback. This is not a claim of live quality.

Do not use bare `recall(<id>)` syntax: for a project/chunk, use the exact ID with the tools above. `pi-observational-memory` remains for legacy compatibility only; if an effective OM package exists, or plastic configuration is invalid, missing, or disabled, plastic-memory stays a context-only bridge without full hooks. Flat-only mode remains legacy with a marker; pre-plastic history stays `historical-unindexed` until an explicit report-first, cursor-bounded backfill of one completed-turn window at a time, with pause/resume/retry and recovery safety. The current root does not expose its authority commands.

## Tests

`node scripts/run-tests.mjs` runs classified suites and reports passed, failed, excluded, and unclassified tests; it also runs `npm test` in `interface/`. Inspect the runner before execution: suites without proven state isolation must not run against existing resources.

## Uninstall

There is no automatic uninstaller. Close PI and compare installed files with this checkout before removing only confirmed harness resources. Preserve sessions, history, project data, credentials, `mcp.json`, and `keybindings.json`; the installer does not keep a complete ownership manifest. The global PI installation and Jev key, if present, are outside the harness tree and require separate evaluation before removal.

## Update

Ask PI to update safely, or invoke `/skill:self-update`. The [self-update skill](../skills/self-update/SKILL.md) is the authoritative procedure for existing installations on Linux, macOS, WSL, and Windows. It preserves local commits and dirty work, prepares a separate candidate for the repository, SDK, package updates, patches, extensions, and assets, and activates only a validated, matching set. It does not run the installers as the routine update path or as a fallback.

The native commands have narrower effects: `pi update` updates the application, `pi update --extensions` updates packages, and `pi update --all` updates both. None independently updates the Evolvera checkout and assets or proves managed-launcher compatibility. The skill does not override these CLI commands, and they have no native check/dry-run option.

Keep credentials, accounts, registries, sessions, custom settings, and active processes out of candidate tests. Verify a fresh managed invocation, account selection, and startup artwork with synthetic data before switching targets; `pi --version` alone is insufficient. Do not automatically `/reload` changed SDK code into a running process. If any required compatibility proof is missing, retain the previous working target and report the gap. Retired-memory cleanup and data migration are not implicit update steps.

## Rollback

### Restore the PI File Without the Patch

The commands below are explicit host repair operations, not the routine update or managed-entry rollback procedure. If account selection uses a managed entry, follow the safe-update recovery procedure instead: generic npm reinstallation can replace its shim and must not overwrite an SDK used by a running process.

The patch is part of the installed global package, not the checkout. To restore the host's exact unpatched copy, directly reinstall the compatible version without subsequently running the patcher or `install.sh`/`install.ps1`:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@1.4.0
```

On Windows:

```powershell
npm install -g @earendil-works/pi-coding-agent@1.4.0
```

This action changes the host and requires fresh confirmation; it was not performed for this task.

### Local Rollback to a Known Revision

Use a temporary worktree to avoid changing the current checkout:

```bash
git worktree add ../evolvera-rollback <good-commit-sha>
cd ../evolvera-rollback
./install.sh
cd ../evolvera
git worktree remove ../evolvera-rollback
```

On Windows, run `install.ps1` inside the worktree.

This reinstalls the chosen revision into the local runtime without rewriting repository history. Rollback restores the previous combination of resources and `settings.json` by staging configuration last; it does not require deleting sessions, history, append-only/project data, or package directories. A future installer run on the current branch applies the newer version again.

### Revert a Shared Change

If a change has already been pushed and should be undone for everyone:

```bash
git revert <bad-commit-sha>
git push origin main
./install.sh
```

Do not use force push for a normal rollback.

### Optional Local Backup

Before a sensitive update, you can copy `~/.pi/agent`. This backup may contain credentials and sessions: keep it only on the local machine and never commit it.

## Repository Structure

```text
.
├── README.md
├── install.sh
├── install.ps1
├── config/
│   ├── SYSTEM.md
│   ├── settings.json
│   ├── models.json
│   ├── keybindings.json
│   └── mcp.json
├── subagents.json
├── agents/
├── skills/
├── extensions/
│   ├── plastic-memory/
│   ├── project-memory.ts      # bridge context-only
│   └── *.ts                   # legacy/current flat extensions
├── themes/
├── interface/
└── docs/
```

`interface/` contains PI Studio as a standalone project and has its own documentation in `interface/README.md`.

## Security

PI can run shell commands, edit files, and access credentials available to the process. Therefore:

- open only projects PI is authorized to work on;
- review diffs before commit and push;
- do not put secrets in prompts, logs, plans, or project memory;
- do not version `auth.json`, sessions, backups, or sensitive local files;
- mount only the necessary directories in Docker;
- require confirmation for destructive or external operations.

## Troubleshooting

### `pi` Is Not Found

Verify the installation and `PATH`:

```bash
npm list -g --depth=0 | grep pi-coding-agent
npm config get prefix
command -v pi
```

On Windows:

```powershell
npm list -g --depth=0
npm config get prefix
Get-Command pi
```

Close and reopen the terminal after correcting `PATH`.

### `EACCES: permission denied` in npm

Configure a user-owned global prefix:

```bash
npm config set prefix "$HOME/npm-global"
npm config set globalconfig "$HOME/npm-global/etc/npmrc"
export PATH="$HOME/npm-global/bin:$PATH"
```

Persist `PATH` in your shell startup file and rerun the installer.

### I Changed the Harness, but PI Still Uses the Old Version

If the change was made in the checkout:

1. run `install.sh` or `install.ps1` again;
2. use `/reload` or open a new session;
3. verify the corresponding file in `~/.pi/agent`.

If the checkout is already located at `~/.pi/agent`, `/reload` or a new session is usually enough for dynamically loaded files.

### VS Code Cannot See the Selection or Diagnostics

1. confirm PI was opened with **Pi: Open**, not from an external terminal;
2. keep a workspace and file open;
3. run **Developer: Reload Window**;
4. check `pi-vscode.path`;
5. try again with `vscode_get_selection` or `vscode_get_diagnostics`.

### PI Broke After `Upgrade Pi and Packages`

First inspect the resolved command, package prefix, and managed-entry identity through the [safe-update skill](../skills/self-update/SKILL.md). Preserve existing credentials and sessions. The following manual repair applies only after confirming a bare, non-managed installation and the effects on that exact prefix; it is not an automatic fallback. Reinstall the compatible fork and run the harness installer again:

```bash
npm uninstall -g @mariozechner/pi-coding-agent
npm install -g @earendil-works/pi-coding-agent@1.4.0
./install.sh
```

Windows:

```powershell
npm uninstall -g @mariozechner/pi-coding-agent
npm install -g @earendil-works/pi-coding-agent@1.4.0
.\install.ps1
```

Then open a new terminal/VS Code window and verify `pi --version`.

## Sources of Truth

When the README and runtime disagree, use this order:

1. active files in `agents/`, `skills/`, `extensions/`, and `config/`;
2. installer behavior;
3. diagnostics and commands run in the runtime;
4. this README.

When changing agents, models, skills, extensions, MCP, or installation, update the documentation in the same commit when the setup or usage experience also changes.
