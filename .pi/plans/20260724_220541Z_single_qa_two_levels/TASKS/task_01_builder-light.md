# Task 01: Add a safe static QA-surface inventory

**Agent**: builder-light  
**Why**: The required inventory utility is a bounded dependency-free CLI with a deterministic local oracle and an independent rollback boundary.  
**Goal**: A read-only Node utility inventories candidate QA/test/browser/stateful-resource surfaces without importing or executing target code, and a committed-fixture smoke test proves its safety contract.

## Read

- `skills/code-audit/scripts/prepare-audit-workspace.mjs` — established dependency-free Node CLI, deterministic output, exclusion, and path-safety patterns
- `skills/code-audit/scripts/test/code-audit.smoke.mjs` — established `.smoke.mjs` assertion style
- `skills/website-home-preview/scripts/test/validate-home-asset-provenance.smoke.mjs` — smaller table-driven Node smoke pattern
- `skills/testing/SKILL.md` — existing stateful-resource terminology that the inventory may identify but must never adjudicate

## Change

- `skills/testing/scripts/inventory-qa-surfaces.mjs` — CREATE — static read-only inventory CLI
- `skills/testing/scripts/test/inventory-qa-surfaces.smoke.mjs` — CREATE — deterministic CLI/schema/safety smoke
- `skills/testing/scripts/test/fixtures/inventory/package.json` — CREATE — inert manifest/test-command fixture, never executed
- `skills/testing/scripts/test/fixtures/inventory/playwright.config.js` — CREATE — inert browser/resource/destructive-marker fixture, never imported

## Proof

- **Semantic delta and anchors**: `skills/testing/` currently has no utility; existing skill scripts establish Node built-ins plus `scripts/test/*.smoke.mjs`. The new semantic unit is static candidate discovery, not command execution or resource classification.
- **Closure**: searched script/test/reference/template conventions under `skills/**`; these four new files are AFFECTED. No registry, manifest, skill frontmatter, SYSTEM route, agent, or existing script is needed because the CLI is explicitly path-invoked. Existing `skills/testing/SKILL.md` is UNAFFECTED at this additive checkpoint.
- **Checkpoint**: after these files alone, `node skills/testing/scripts/test/inventory-qa-surfaces.smoke.mjs` reads only committed inert fixtures, returns PASS, and leaves the repository unchanged. The existing testing route remains valid.
- **Acceptance path**: target directory → non-executing static walk/parse → sorted JSON candidate groups → QA operator receives paths/marker labels while still having to prove command resolution and disposability independently. Preserved journey: existing `testing` skill behavior is unchanged.
- **Counterexample pass**: symlink traversal, root/home scans, generated/dependency recursion, raw env/secret values, package-script execution, imports, and child-process execution would violate the read-only oracle; the contract and smoke reject those behaviors without needing another artifact.

## Contract

- CLI: `node skills/testing/scripts/inventory-qa-surfaces.mjs <absolute-or-relative-target-directory>`; exactly one target is required, invalid/missing/non-directory/root/home targets fail nonzero with a concise sanitized error.
- Use Node built-ins only. Do not import/require target files, execute package scripts or lifecycle hooks, spawn target commands, load env files, start apps/browsers, or make network calls. Do not follow symlinks.
- Conservatively skip `.git`, dependency/vendor directories, generated/build/coverage/cache outputs, binaries, oversized files, and permission-denied entries; record sanitized warnings rather than broadening access.
- Emit deterministic JSON on stdout with a schema version, resolved target, `static-read-only` mode, exclusions/warnings, and sorted candidate groups for manifests/commands, test runners/hooks/fixtures, browser/UI, stateful-resource markers, and destructive/egress markers.
- Candidate entries expose relative paths and predefined marker labels only—never raw file snippets, env values, credential-like values, or a `DISPOSABLE_VERIFIED`/PASS conclusion. Package script names may be listed, but command values are not emitted.
- The smoke uses only the committed inert fixtures, performs no writes, and verifies schema, deterministic ordering, expected categories, invalid-root failure, no raw marker values, and no fixture execution/import side effect.

## Acceptance

- [ ] The CLI uses no runtime dependency and performs no target-code import, execution, network call, or filesystem write.
- [ ] Output is deterministic, machine-readable, sorted, sanitized, and labels findings as candidates rather than safety proof.
- [ ] Browser/test/stateful/destructive fixture surfaces are found while raw values and command bodies are absent.
- [ ] Symlinks and standard dependency/generated/cache roots are not traversed; invalid dangerous targets fail closed.
- [ ] The smoke command prints a clear PASS and a pre/post focused status check shows no repository mutation.
- [ ] The stable CLI path and output contract are ready for the `testing` skill to reference.

## Constraints

- Preserve `skills/testing/SKILL.md` and every existing skill/agent/system file unchanged.
- Do not add a package, lockfile, generic scanner framework, safety classifier, command resolver, browser runner, or harness generator.
- Treat fixture files as text only; never import or execute `playwright.config.js` or run fixture package scripts.
- Do not touch pre-existing dirty/untracked files or run repo-wide formatting/codemods.

## Validation

- `node skills/testing/scripts/test/inventory-qa-surfaces.smoke.mjs` — `NO_STATEFUL_RESOURCES`; expected `PASS` with no repository writes or target-code execution
- `node --check skills/testing/scripts/inventory-qa-surfaces.mjs && node --check skills/testing/scripts/test/inventory-qa-surfaces.smoke.mjs` — both scripts parse
- `git diff --check -- skills/testing/scripts/inventory-qa-surfaces.mjs skills/testing/scripts/test/inventory-qa-surfaces.smoke.mjs skills/testing/scripts/test/fixtures/inventory/package.json skills/testing/scripts/test/fixtures/inventory/playwright.config.js` — no whitespace errors
- Focused pre/post `git status --porcelain=v1 --untracked-files=all` comparison — only the four declared paths are new; every pre-existing entry is unchanged

## Stop If

- Safe inventory requires importing/executing project code, reading secret values, following symlinks, adding a dependency, or changing the existing testing skill.
- Any declared target path already exists or overlaps pre-existing dirty/untracked work.

## Checkpoint

- Recovery snapshot: not required; all owned files are new and rollback is deletion of only these paths before the selective checkpoint.
- Commit scope: exactly the four `Change` paths; do not stage PLAN_DIR or any pre-existing dirty/untracked path.
