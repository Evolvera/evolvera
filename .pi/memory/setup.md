# Setup

## Compatible PI upgrades

- This configuration uses `@earendil-works/pi-coding-agent`, not `@mariozechner/pi-coding-agent`.
- Known compatible baseline: Node.js `>=22.19.0`; locally validated target `fnm 22.22.3`; `@earendil-works/pi-coding-agent@0.82.1`.
- Update by pulling this repository and running `./install.sh` or `.\install.ps1`. The installers reject unsupported Node versions. Version environment variables are explicit test overrides, not routine update channels.
- Do not use **Upgrade Pi and Packages** in `pi-vscode` 0.0.9: it hardcodes the Mariozechner package and can replace the required fork.
- After repair/update, open a fresh terminal and verify `pi --version` plus normal startup. Roll back by rerunning the repository installer at the last known-good commit.
