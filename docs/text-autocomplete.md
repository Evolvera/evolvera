# Plain-text Tab autocomplete

`text-autocomplete.ts` layers a free, offline completion provider onto PI's built-in TUI autocomplete. It suggests words from recent user-authored text on the active session branch only; it does not call a model, write history, or download data. Each request reads the current branch so a branch/session change cannot reuse prior words. Work is bounded to the last 60 entries, 4,000 text characters per user message, 600 distinct words, and 8 suggestions.

The SDK stacks providers around its current provider. Native suggestions are returned untouched whenever present, and the wrapper delegates completion application and the existing file-trigger decision to that provider. Thus native slash-command, `@file`, path completion, and stock Tab/editor behavior remain in charge. Installation occurs only on `session_start` when `ctx.mode === "tui" && ctx.hasUI`; other modes are unchanged.

This extension does not replace the editor, claim a keybinding, submit text, persist a cache, or access assistant/tool/system messages. Credential-like long alphanumeric tokens and numeric-only words are excluded heuristically; do not treat this local suggestion filter as a security boundary.

Focused synthetic test (no SDK/runtime import or stateful resources):

```sh
C:/Users/kevin/AppData/Local/nvm/v24.20.0/node.exe --test extensions/test/text-autocomplete.smoke.mjs
```
