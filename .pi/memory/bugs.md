# Confirmed Bugs

## VS Code upgrade replaces the required PI fork

- **Symptom:** after **Upgrade Pi and Packages**, startup fails while loading `pi-xai-oauth`, with `@earendil-works/pi-ai/dist/index.js/compat` in the missing-module path.
- **Root cause:** `pi-vscode` 0.0.9 hardcodes `@mariozechner/pi-coding-agent@latest`; this configuration and `pi-xai-oauth` require the Earendil package family. The published `@earendil-works/pi-ai@0.80.10` still contains and exports `./compat`; the failure is package-family/loader resolution skew, not removal of `compat.js`. The reported Node `22.12.0` is also below the baseline's declared `>=22.19.0` engine.
- **Prevention:** use Node `>=22.19.0`, run the repository installers, keep the tested Earendil/xAI pair aligned, and avoid the VS Code upgrade button until upstream detects the installed package instead of hardcoding one.
- **Upstream tracking:** `pithings/pi-vscode#15` already records the hardcoded wrong-package behavior.
