# App Validation — <head8>

## APP VALIDATION: PASS | BLOCKED | UNVERIFIED
Target: <base>..<head>
Outcome exercised: <approved behavior and affected capabilities>
Platforms/devices: <platforms and sanitized identifiers>
Harness: REUSED | EXTENDED | BOOTSTRAPPED — <authoritative root and exact changed files>
Harness maintenance: <HARNESS_DRIFT/CONTRACT_CHANGE items, reason, and authorizing contract evidence | none>
Agent quickstart: <harness-root>/README.md — <documented command surface>
Cold-use check: PASS | FAIL — `<help>`; `<doctor>`; `<list>`; <observations>
Acceptance journeys:
- J1 <title> — PASS | FAIL — `<journey path>` — step/oracle: <evidence>
- J2 <title> — PASS | FAIL — `<journey path>` — step/oracle: <evidence>
Preserved journeys: <suite/journeys and results>
UI evidence: <AX/UIAutomator/platform-state and screenshot references>
Non-UI oracles: <API/DB/log/filesystem/platform state | none>
Stateful resource receipt: <NO_STATEFUL_RESOURCES or sanitized DISPOSABLE_VERIFIED resources, ownership, destructive hooks, network boundary, teardown>
Protected-resource postcheck: <unchanged/unreachable evidence>
Findings/pitfalls: <IDs/titles | none>
Failures/flakiness: <first failure, reproduction, retries | none>
Evidence gaps: <unsafe/unavailable/provider-bound evidence | none>
Next: <bounded product repair | harness repair | fresh validation | validator/qa handoff | user/environment decision>

## Harness change receipt

| File | Classification | Why required | Contract evidence | Validation |
|---|---|---|---|---|
| `<path>` | `BOOTSTRAP | HARNESS_DRIFT | CONTRACT_CHANGE` | <reason> | <OUTCOME/PRESERVE/CHANGE/REMOVE item> | <command/observation> |

## Reuse instructions verified

- Working directory: `<PROJECT_ROOT>`
- Help/doctor: `<copy-paste commands>`
- List and run one journey: `<copy-paste commands>`
- Run preserved/smoke suite: `<copy-paste command>`
- Find evidence: `<path/command using run_id>`
- Safe run-owned teardown: `<copy-paste command>`
- Required environment names: `<names only; no values>`
- Protected-resource/network boundary: `<summary>`

## Notes for the next agent

- Existing harness capability reused: <summary>
- Capability added or maintained: <summary>
- Timing/flakiness and mitigation: <summary>
- Remaining explicit gap: <summary | none>
