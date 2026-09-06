# Ymir PI profile bundle v1

This document defines the portable, deterministic PI profile artifact consumed by Ymir. The bundle is a representation of an approved source commit; it is not an installer, updater, deployment mechanism, or release approval.

## Build

From this repository, run the standard-library builder with an exact full commit ID and a fresh, run-owned output directory:

```bash
python3 scripts/build-ymir-profile.py \
  --source-sha <40-lowercase-hex-commit> \
  --output-dir <run-owned-directory>
```

The builder reads tracked bytes and Git modes from that commit using Git object reads. It never reads dirty working-tree files, checks out the commit, fetches, or executes source content. The output directory must be empty and is never used as a source.

Three files are produced:

- `ymir-profile.tar.gz` — the deterministic archive;
- `ymir-profile.manifest.json` — the external, canonical manifest;
- `ymir-profile.sha256` — SHA-256 lines for the archive and manifest, using those fixed filenames.

## v1 wire format

The archive contains only sorted POSIX regular files beneath `agent/`. It contains no directory, link, or special entries. Every entry has uid/gid `0`, empty owner names, mtime `0`, and a normalized mode: source executable files become `0755`, all other regular files become `0644`. The tar and gzip timestamps are zero, and gzip has no original filename.

The manifest is UTF-8 JSON with sorted keys, compact separators, and one trailing newline:

```json
{"archive":{"name":"ymir-profile.tar.gz","sha256":"<64-hex>"},"files":{"agent/<path>":{"mode":"0644","sha256":"<64-hex>"}},"format":1,"pi_version":"0.83.0","source_sha":"<40-lowercase-hex>"}
```

The archive digest is included in the manifest. The checksum file contains two standard SHA-256 lines, one for `ymir-profile.tar.gz` and one for `ymir-profile.manifest.json`; the manifest is external so no circular digest is required.

## Canonical inventory and mapping

The v1 source projection is:

- six files: `config/SYSTEM.md`, `config/models.json`, `config/pi-goal.json`, `config/settings.json`, `config/mcp.json`, and root `subagents.json` map to `agent/` by basename;
- all 32 direct `agents/*.md` files map to `agent/agents/`;
- all contents of 26 `skills/<name>/` roots map to `agent/skills/<name>/`, and each root must contain `SKILL.md`;
- the one `themes/*.json` file maps to `agent/themes/`;
- all 11 direct `extensions/*.ts` files map to `agent/extensions/`, excluding only `project-memory.ts`.

Tests, `extensions/test`, the Plastic Memory implementation, top-level mirrors, installers, patchers, unrelated source roots, and runtime artifacts are not bundle inputs. Skill-owned scripts, tests, templates, and references remain inputs because they are part of the skill roots.

The builder rejects missing required inputs, links and special modes, unsafe paths, duplicate output paths, literal credential patterns, personal-machine paths, invalid JSON, invalid UTF-8 documents, and missing local Markdown references. URLs are not fetched. JSON is syntax-checked without imposing provider or notifier choices on canonical settings.

## Portable installed paths

Commands that address an installed skill use the runtime-selectable agent directory:

```bash
"${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/skills/<skill>/..."
```

Examples and documentation for the installed PI package use `$(npm root -g)/@earendil-works/pi-coding-agent`, rather than a machine-specific prefix or retired package name. The PI Tool Expert helper honors `PI_CODING_AGENT_DIR`; otherwise it falls back to `HOME`/`os.homedir()` plus `.pi/agent`.

Canonical `settings.json` is projected as a complete file during installation/projection. Existing execution-mode state semantics remain unchanged: configured state is read from its existing global/project settings paths and native session entries, with their established precedence; native sessions and project settings are not moved into a new bundle-managed store. A later canonical settings overwrite therefore does not promise preservation of local global execution-mode edits.

The archive's hashes authenticate its bytes to the source commit and release process. This format does not itself publish, deploy, authorize, or claim provider-enforced release immutability.
