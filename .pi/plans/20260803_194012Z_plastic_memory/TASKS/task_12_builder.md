# Task 12: Prepare deferred single-owner installation

**Agent**: builder  
**Why**: Source installers currently copy settings before code, copy only flat extensions, and install OM; cutover must stage the full plastic tree first without losing unrelated dirty work.  
**Goal**: Source config and cross-platform installers that retire configured OM, install four Luna-medium blocks, recursively stage plastic-memory, and write activating settings last, proved only in temp/fake environments.

## Read
- `config/settings.json` — exact OM package/config anchors and unrelated dirty work
- `install.sh` — config, extension, package, and done sections plus self-root behavior
- `install.ps1` — Windows-equivalent sections and `pi-provider-kimi-code` preservation
- `extensions/plastic-memory/config.ts` — exact installed schema/defaults
- `extensions/plastic-memory/index.ts` — enabled/package-collision behavior
- `extensions/project-memory.ts` — inactive/full bridge behavior
- `extensions/test/plastic-memory-cutover.smoke.mjs` — installed ownership oracle
- `README.md` — documented deferred activation/rollback
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md` — recursive extension discovery
- `/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/docs/packages.md` — settings package semantics

## Change
- `config/settings.json` — MODIFY — remove only OM package/config and add enabled plastic-memory edge/pool/retry/budget/four-role Luna-medium blocks
- `install.sh` — MODIFY — stage `extensions/plastic-memory/` recursively, preserve flat bridge/extensions and self-root source, omit OM install, and copy activating settings after all resources
- `install.ps1` — MODIFY — equivalent recursive/self-root/deferred-settings/OM-retirement behavior while preserving Windows-only packages
- `extensions/test/plastic-memory-install.smoke.mjs` — CREATE — temp-source/destination/fake-command staging, fault-order, same-root, dirty-hunk, and static PowerShell oracles

## Proof
- **Semantic delta and evidence anchors:** source settings contain OM and 10k/20k values; both installers copy configuration before resources, copy only `extensions/*.ts`, and invoke OM installation. The extension root is recursively auto-discovered and full ownership is guarded by config/package collision.
- **Coverage receipt:** source settings memory anchors → installed activation; extension/resource copy order → complete tree before settings; package lists/commands → OM inertness; source=destination/fault → preservation; three dirty files → selective hunks. `AFFECTED`: four paths. `UNAFFECTED`: root active `settings.json`, package directories, auth/sessions/memory, unrelated packages/providers/keybindings/agents/skills, and live installation.
- **Closure:** every duplicated activation representation—source config, POSIX installer, PowerShell installer, installed-resource simulation—is owned here. Runtime/bridge already support both pre/post-cutover states.
- **Checkpoint:** temp external and same-root simulations with fake `npm`/`pi` prove complete code precedes settings, staging fault leaves old settings, no OM package command occurs, one full owner loads, and pre-existing dirty hunks remain byte-identical/unstaged.
- **Acceptance path:** source config/resources → temp staged destination → final settings → jiti owner inventory. Existing sessions/data/unrelated install behavior are `PRESERVE`; memory owner/config `CHANGE`; OM configured/install invocation is `REMOVE`.
- **Counterexample:** final destination inspection alone passes even if settings was copied before a later failed extension copy. A forced pre-activation fault must preserve the destination’s prior settings bytes.

## Acceptance
- [ ] `config/settings.json` removes only `npm:pi-observational-memory@3.0.3` and `observational-memory`, adds `plastic-memory.enabled: true`, preserves 10k/20k edge and 20k/10k pool values, one-retry/TTL/bounds, and exactly four independent `openai-codex/gpt-5.6-luna` `medium` role blocks.
- [ ] Neither installer installs/removes OM; stale package files may remain inert because settings no longer load them. All unrelated package/provider/platform behavior, including PowerShell `pi-provider-kimi-code`, is preserved.
- [ ] Both installers recursively stage the complete `extensions/plastic-memory/` tree and retain flat extension/`project-memory.ts` deployment.
- [ ] Activating `settings.json` is the final cutover write after extensions/skills/resources; forced staging failure leaves previous destination settings byte-identical.
- [ ] Source-equals-destination mode skips destructive self-copy/delete and leaves tracked source intact.
- [ ] Temp installed-resource jiti loading reports one plastic compaction owner and one project-context owner; rollback remains settings/checkpoint based and preserves append-only/project data.
- [ ] Pre-existing unrelated hunks in `config/settings.json`, `install.sh`, and `install.ps1` remain byte-identical and unstaged after selective commit; no live installer/package/reload/migration/provider/session/memory operation runs.

## Constraints
- Before each dirty-file edit, capture exact content/hash and current diff. Patch only: settings package/`observational-memory` anchors; shell config/extensions/package sections; PowerShell config/extensions/package sections. Stage only plastic-memory hunks.
- Do not modify root `settings.json`, run repository/live installers, `/reload`, `pi install/remove`, npm network commands, provider calls, or real migration.
- Temp staging uses run-owned source/destination/HOME and fake commands only; classify `DISPOSABLE_VERIFIED`. Real Windows execution remains unverified.
- No dependency/manifest, destructive package-directory removal, hardcoded user path, or unrelated installer cleanup.

## Validation
- `node extensions/test/plastic-memory-install.smoke.mjs` — PASS for temp external/same-root staging, recursive tree, fake command log, deferred-settings fault, four roles, OM absence, one-owner jiti load, dirty-hunk proof, and static PowerShell parity; real Windows reported UNVERIFIED
- `bash -n install.sh` — POSIX syntax only; does not execute installer
- `grep -nE 'pi-observational-memory|"observational-memory"|Qwen' config/settings.json install.sh install.ps1` — no active retired/stale worker reference
- `git diff --check -- config/settings.json install.sh install.ps1 extensions/test/plastic-memory-install.smoke.mjs` — no whitespace errors

## Stop If
- Pre-existing dirty hunks cannot be separated, same-root safety/final activation order cannot be proven in temp state, or settings activation can precede an incomplete resource tree.

## Checkpoint
- Recovery snapshot: required for all three dirty shared files; retain pre-edit copies/hashes/diff outside the product commit and verify unrelated hunks after selective staging/commit.
- Commit scope: only plastic-memory hunks in `config/settings.json`, `install.sh`, `install.ps1`, plus `extensions/test/plastic-memory-install.smoke.mjs`.
