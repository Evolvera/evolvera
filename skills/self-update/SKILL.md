---
name: self-update
description: Safely update the Evolvera PI harness and its pinned PI installation from the intended repository branch on macOS, Linux/WSL, or Windows; verify the new installation and startup.
---

# Update Evolvera PI

Use this skill when the user asks PI to update itself, the Evolvera harness, or both. A direct update request authorizes the routine local workflow below; do not ask for confirmation at each ordinary step. This skill describes how to perform an update when invoked—it does not run an update merely because the skill was created, loaded, or mentioned. Report the target branch and checkout, installer result, and verification clearly; do not expose secrets, session data, or unrelated local changes.

## 1. Locate and verify the checkout

Search these candidate locations, in order, using only paths that exist:

1. The skill's repository candidate: the directory two levels above this `SKILL.md` (`../../`).
2. The current working directory's Git root (`git rev-parse --show-toplevel`).
3. `~/.pi/agent` (on native Windows, `$HOME\.pi\agent`).
4. The documented checkout `~/Evolvera/Pi` (on native Windows, `$HOME\Evolvera\Pi`).

A candidate is valid only if it is a Git worktree containing the expected Evolvera installer (`install.sh` or `install.ps1`) and `git remote get-url origin` identifies the Evolvera repository. Verify the remote URL itself, not the directory name: the known origin `https://github.com/Evolvera/Pi.git` redirects to `https://github.com/Evolvera/evolvera.git`; accept either exact repository identity over GitHub HTTPS or SSH (`git@github.com:Evolvera/Pi.git` etc.), not a lookalike host or unrelated project with a plausible folder name. If several candidates are valid, prefer the skill's repository candidate, then cwd Git root, then the documented locations; tell the user which checkout will be updated.

If none is verified and `~/Evolvera/Pi` does not exist, clone the official Evolvera URL there using an available, scoped GitHub credential, then verify its remote and installer before continuing. Do not print credentials, create a credential file, overwrite or repurpose an existing directory. If no safe fresh path or authentication is available, stop and report what is missing; do not guess.

## 2. Establish the intended fast-forward update

Inspect the checkout before changing it:

- `git status --short`
- `git branch --show-current`
- `git branch -vv` (or equivalent upstream inspection)
- `git remote get-url origin`

The intended branch is the checked-out local branch and its configured origin upstream. Do not switch branches to chase a presumed default/latest branch. If there is no upstream, the requested branch is unclear, or the origin/branch does not match the intended Evolvera checkout, stop and ask only the specific question needed to resolve it.

If the checkout has local changes, inspect whether they overlap installer inputs or files the installer may overwrite/remove. Preserve all user changes. Do not stash, reset, clean, force-pull, discard files, or resolve conflicts by choosing one side. Stop before pull if dirty state could be overwritten or its safety is unclear. Otherwise update with a fast-forward-only pull of the verified upstream (for example, `git pull --ff-only`). Stop on divergence, conflict, authentication failure, or any unexpected result; do not retry using a destructive alternative.

## 3. Preflight installer effects and protected state

Read the selected repository installer's relevant operations before running it. The installers install the pinned `@earendil-works/pi-coding-agent` version (currently 1.3.0), install/update harness assets and packages, and may overwrite files in `~/.pi/agent`. They also remove retired assets: the shell installer removes `plan-heavy.ts`, `goal-mode.ts`, named retired agent files, `extensions/maestro`, `project-memory.ts`, and `plastic-memory`; the PowerShell installer removes `goal-mode.ts`, named retired agent files, `extensions/maestro`, `project-memory.ts`, and `plastic-memory`. Both skip most asset synchronization when the checkout is the same root as `~/.pi/agent`.

Before execution, compare those effects with the actual installer version and inspect affected user state, including local/untracked changes and custom data in paths that may be overwritten or removed. Stop before the installer if a cleanup target contains user-owned/custom data, an affected file has unprotected local edits, installer behavior is unexpected, or the consequences are unclear. Do not pre-delete or move files to make the installer pass. Never copy session data or secrets. Routine updates do not authorize destructive handling of protected user state.

Confirm Node.js is at least `22.19.0` before installation; both authoritative installers enforce this minimum. Do not use environment-variable version overrides as a routine update channel. Do not independently update PI to an arbitrary/latest npm version: the repository installer pins a compatible version and applies its required patches. Do not use **Upgrade Pi and Packages** in `pi-vscode` 0.0.9: it hardcodes `@mariozechner/pi-coding-agent` and may replace the required `@earendil-works/pi-coding-agent` fork.

## 4. Run the installer for the actual OS and shell

Use only a shell that is actually available:

- macOS or Linux/WSL: `bash ./install.sh`
- Native Windows PowerShell: `& .\install.ps1`

Do not invoke the Windows installer from Bash or the shell installer from PowerShell. Stay in the verified checkout and do not run npm, alternate installers, or cleanup commands separately. If the installer fails or shows an unexpected destructive effect, stop immediately; do not retry, repair, or restore without resolving the cause and obtaining any needed user decision.

## 5. Verify and report

After a successful installer run, use `/reload` if available, then open a fresh terminal and verify `pi --version` and that `pi` starts normally. A fresh terminal matters because the current process may still use the old executable/environment. If startup fails, capture only safe diagnostic details and report the failure; do not expose credentials, session contents, or unrelated user data.

Report the verified repository/branch and resulting commit, installer and exit result, Node version, `pi --version`, and whether fresh startup succeeded. Clearly distinguish a successful repository update from a successful installation/startup if a later verification step fails.

For rollback, rerun the repository installer from the last known-good commit using a verified checkout of that commit. Do not reset, force-checkout, or discard changes in the updated checkout to reach it. If no safe last-known-good checkout is available, stop and ask before creating one or taking any other recovery action.
