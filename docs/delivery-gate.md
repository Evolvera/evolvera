# Delivery gate

Keeps a session working until a delivery is proven, and uses an Orca automation to resume it when the session dies. Off by default.

## Turn it on

Create `~/.pi/agent/delivery-gate.json` and start a new session:

```json
{ "enabled": true }
```

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `false` | Registers the `delivery` tool and the settle gate |
| `watch` | `true` | Creates an Orca automation per delivery and removes it when the delivery is ready or cancelled |
| `watchCron` | `*/30 * * * *` | Automation schedule |
| `maxTurns` | `80` | Continuations before the delivery stalls |
| `maxStalls` | `8` | Continuations without progress before it stalls |
| `checks` | `[]` | Extra gates: `{ "name": "design", "command": "npm run design:check", "ui": true }` |

## Gates

`spec`, `quality`, `tests`, `docs`, `browser` (with `ui`), your `checks`, `review` and `ci` (GitHub projects).

- A proof is bound to a fingerprint of the project content without Markdown. Changing code expires it; committing the same content does not.
- `quality`, `tests`, `browser` and `checks` run the command and need exit 0. `tests` also needs at least one executed test in the output.
- `browser` needs mobile, tablet, desktop, wide and dark screenshots newer than the last change.
- `review` only accepts a verdict from another PI session, recorded with `action=verdict`.
- `ci` needs a clean tree, a workflow, the PR head equal to the local commit, no conflict and every check green.

The turn is released while the delivery waits for review or CI, asks the owner for a decision, stalls, or is ready. Merging and publishing stay behind the owner's go-ahead.

## Orca automation

`action=start` runs `orca automations create --provider pi --workspace path:<project>`, so the project has to be an Orca workspace. Its precheck (`deliveries/watch.mjs`) skips the run without calling a model unless the delivery has been idle for 20 minutes or its wait is over. Without Orca the gate still works and `action=status` says the watch is off.
