# Setup

## Compatible PI upgrades

- This configuration uses `@earendil-works/pi-coding-agent`, not `@mariozechner/pi-coding-agent`.
- Known compatible baseline: Node.js `>=22.19.0`; locally validated target `fnm 22.22.3`; `@earendil-works/pi-coding-agent@0.82.1`.
- Update by pulling this repository and running `./install.sh` or `.\install.ps1`. The installers reject unsupported Node versions. Version environment variables are explicit test overrides, not routine update channels.
- Do not use **Upgrade Pi and Packages** in `pi-vscode` 0.0.9: it hardcodes the Mariozechner package and can replace the required fork.
- After repair/update, open a fresh terminal and verify `pi --version` plus normal startup. Roll back by rerunning the repository installer at the last known-good commit.

## Windows screenshots in Warp/WSL

- For PI running inside WSL under Warp for Windows, use `Alt+V` to paste a screenshot captured with `Win+Shift+S`; `@` before the shortcut remains optional.
- Under WSL, a fresh `./install.sh` setup installs both `Ctrl+V` and `Alt+V` for `app.clipboard.pasteImage`. On macOS and native Linux, the installer does not create this file and PI defaults remain in effect. If `~/.pi/agent/keybindings.json` already exists, including as a symlink, the installer preserves it unchanged; add `alt+v` manually when that customized file does not already contain the alias.
- Smoke-check the live flow after `/reload`: `Win+Shift+S` → optional `@` → `Alt+V` should insert an accessible `/tmp/pi-clipboard-<uuid>.png` path.
