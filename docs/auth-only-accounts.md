# Auth-only accounts

The managed launcher keeps Pi's native CLI as the sole owner of argument parsing, session selection, project trust, settings, resource loading, and interactive/RPC/print dispatch. It prepares an exact-version source bridge in a fresh temporary code stage; it does not patch or install the SDK.

## Account and session behavior

- On a fresh application session, choose an account before an account credential store or model runtime is constructed. Existing sessions use their stored `pi.account` custom entry; a legacy session is associated once. New/fork session replacements inherit only from the native predecessor. Unknown, malformed, or conflicting bindings fail closed.
- The first application account is immutable for that launcher invocation. A session bound to a different account needs a fresh process. The launcher will not replace, signal, spawn, or rewrite the environment of another process to change accounts.
- `/usuario status`, `/usuario list`, and `/usuario create <id> [label]` remain available. `/usuario use <id>` validates the account and gives fresh-process guidance; it does not switch or restart the current session. Creating an account creates only its credential namespace, not credentials or history.
- Account credentials live in the registry-issued account namespace. Pi's normal agent directory, model catalog/cache, cwd, settings, sessions, history, memory, agents, skills, plugins, and other resources remain shared. No secret or account-specific model catalog is copied into a projection.
- SDK auth resolution receives a sealed account context. Catalog auth-bearing fields are filtered according to the selected-account policy; explicitly supported owner literals remain by reference. Native provider/model algorithms and shared model definitions remain native.
- Metadata/help/version and other early no-auth paths stay lazy and do not prompt. Auth utilities select an account explicitly before constructing credentials. Metadata uses inert credentials and no persistent account store.

## Scope and limitations

This boundary isolates the SDK's credential store, auth context, and supported model configuration; it is not an OS security boundary. Native Windows/TTY presentation, full provider execution, downstream AWS/GCP credential behavior, and opaque extension-specific auth are **UNVERIFIED**. Synthetic source-extracted/fake-SDK tests do not certify installed SDK execution, native CLI behavior, provider/network behavior, or Plastic/subagent runtime behavior. The SDK's public completion method is checked with fake parent references; no production adapter is added. Existing Plastic SDK-compatibility changes remain protected, separate, uncommitted WIP: they are not included or certified by this account checkpoint. A clean checkout must not be treated as having those changes.

The earlier full-profile workspace/session/environment admission and same-terminal replacement supervisor are historical evidence, not active account startup paths. No real installation activation or account-state migration is part of this feature.
