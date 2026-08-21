# Unstuck Notebook — <short problem title>

> Data format for the `unstuck` skill. The skill is the authority on the workflow; this file only defines how the notebook is written.
> Copy to `<project-root>/.pi/recovery/unstuck/<UTC-timestamp>-<slug>.md`. Never overwrite an existing notebook.
> Only the primary orchestrator writes here. Summary sections are mutable; the experiment log is append-only.

## Metadata

- **Status:** `OPEN | BLOCKED | RESOLVED`
- **Target project / root:** `<absolute path>`
- **Created (UTC):** `<YYYY-MM-DDThh:mm:ssZ>`
- **Last updated (UTC):** `<YYYY-MM-DDThh:mm:ssZ>`
- **Goal:** <what the user actually needs, one sentence>
- **User-approved scope:** <files, systems, and operations already authorized; everything else is out of scope>
- **Budget / stop condition:** <time, attempts, or cost limit agreed with the user>

## Success oracle

<How anyone — not just this agent — decides the problem is solved. Exact command, output, behavior, or observable state. If this cannot be stated, resolve it before running experiments.>

## Environment and baseline

| Item | Value | Type |
|---|---|---|
| Runtime / versions | <exact versions in use> | `OBSERVED` |
| Branch / commit | <ref> | `OBSERVED` |
| Working tree | <clean / dirty: unrelated changes present> | `OBSERVED` |
| Reproduction | <exact command or steps; or `UNKNOWN`> | `OBSERVED` / `UNKNOWN` |
| Symptom | <exact error text or observed behavior> | `OBSERVED` |

## Safety and resource boundary

- **Reachable resource set:** `NO_STATEFUL_RESOURCES` | `<resource> = DISPOSABLE_VERIFIED (run-owned, created this run)` | `NONDISPOSABLE` | `UNKNOWN`
- **Protected / untouchable:** <production, staging, shared, user, dev state; unrelated dirty work>
- **Mutation permitted?** `no (diagnostic freeze)` | `yes, limited to: <exact write set>`
- **Evidence of disposability:** <how it was verified; a name, label, localhost, Docker, transaction, or backup is not evidence>

## Evidence registry

| ID | Type | Provenance / location | Date (UTC) | Observation |
|---|---|---|---|---|
| E1 | `OBSERVED` | `<file:line or command>` | <date> | <concise fact, no dumps> |
| E2 | `RETRIEVED` | `<official URL + version>` | <date> | <concise fact> |
| E3 | `INFERRED` | from E1 + E2 | <date> | <derivation stated explicitly> |

## Current understanding

**Established facts** (`OBSERVED` / `RETRIEVED` / `INFERRED` only, each citing evidence IDs):

- <fact> — E1, E2

**Model priors** (`MODEL_PRIOR` — hypothesis fuel, never decision-critical):

- <recalled belief with no evidence in this run>

**Open unknowns** (`UNKNOWN`, ranked by decision impact):

1. <what is undetermined and which decision it blocks>

## Attempts already made

| # | Action | Result | Verdict | Why it did not resolve |
|---|---|---|---|---|
| A1 | <what was tried, before or during this notebook> | <observed result> | `REFUTED` / `UNRESOLVED` | <causal reason> |

## Hypothesis registry

### H1 — <one-sentence causal claim>

- **State:** `OPEN | SUPPORTED | WEAKENED | REFUTED | UNRESOLVED`
- **Prediction if true:** <specific observable consequence>
- **Favorable evidence:** <IDs>
- **Contrary evidence:** <IDs>
- **Refutation condition:** <the exact observation that kills this hypothesis>
- **No-retry condition:** <what must never be re-run under this hypothesis without new evidence>

### H2 — <competing claim predicting a different observation>

<same fields>

## No-retry ledger

| Causal path | Why closed | Evidence | Reopen only if |
|---|---|---|---|
| <action / query / edit> | `REFUTED` / non-informative | <IDs> | <new evidence, changed input or version, or materially different prediction> |

## Candidate probe priority matrix

| ID | Probe | Decision changed | Hypotheses separated | Novel? | Info value | Risk / blast radius | Reversible? | Cost | Disposition |
|---|---|---|---|---|---|---|---|---|---|
| P1 | <probe> | <decision> | H1 vs H2 | yes | high | none (read-only) | n/a | low | **selected** |
| P2 | <probe> | <decision> | H1 only | yes | low | none | n/a | low | rejected — non-informative |
| P3 | <probe> | — | — | no | — | <radius> | no | — | rejected — gate <n> `UNKNOWN` |

Admission gates in order: authorization, decision value, novelty, resource safety, blast radius, reversibility, stop condition. Any `UNKNOWN` on a material gate rejects the probe.

## Current decision / next probe

- **Selected:** P<n>
- **Rung:** <test ladder rung 1–7>
- **Why it outranks alternatives:** <lexicographic justification>
- **Stop condition:** <exact limit>

## Experiment log (append-only)

### X1 — <probe name>

**Pre-registration** (written *before* execution)

- **Hypothesis under test:** H<n>
- **Decision that changes:** <decision>
- **Difference from prior attempts:** <causal difference, not wording>
- **Exact action:** `<command or precise step>`
- **Prediction (falsifiable):** <specific expected result>
- **Refutes H<n> if:** <observation>
- **Can affect:** <files, processes, state, external systems>
- **Reversal:** <how effects are independently undone; `n/a — read-only`>
- **Stop condition:** <limit>

**Result** (written immediately after, before any further attempt)

- **Actual:** <what happened; concise, cite artifacts instead of pasting dumps>
- **Prediction verdict:** `confirmed | refuted | inconclusive`
- **Grading source:** <external/deterministic evidence used; not self-assessment>
- **Hypothesis updates:** H1 -> `WEAKENED`, H2 -> `OPEN`
- **New evidence:** E<n>
- **New unknowns:** <...>
- **Ledger update:** <path added to no-retry, if any>

<!-- Append X2, X3, ... Never edit or delete a finalized entry. -->

## Amendments

| ID | Date (UTC) | Amends | Correction | Reason |
|---|---|---|---|---|
| AM1 | <date> | X<n> / E<n> | <what is now known to be wrong and what replaces it> | <new evidence> |

## Implementation and validation

- **Cause supported by evidence:** <cause> — E<ids>, X<ids>
- **Authorized fix scope:** <exact write set>
- **Change made:** <one coherent change per step>
- **Focused oracle:** <the check that decides success>
- **Original reproduction re-run:** <result, or `not run` with reason>
- **Negative / control case:** <proof the check can fail / symptom returns without the fix>
- **Regression surface:** <what was run within the resource gate, or `not run`>
- **Focused diff reviewed:** <yes / no>
- **Independent verification:** <what, by whom/what, result — or `not applicable`>

## Resolution

- **Answer / fix:** <what resolved it>
- **Causal chain:** symptom -> <mechanism> -> cause -> correction, citing E/X IDs
- **Residual uncertainty:** <what remains unproven>
- **Status:** `RESOLVED`

## Blocker

- **Known for certain:** <facts with IDs>
- **Refuted causal paths:** <paths and refuting evidence>
- **Remaining unknowns:** <ranked by decision impact>
- **Required external / user action:** <exact action needed to unblock>
- **Why continuing would loop:** <no admissible discriminating experiment / missing authorization / missing observability>
- **Status:** `BLOCKED`

---

**Hygiene:** no secrets, credentials, tokens, or PII; no raw log dumps, full file copies, or pasted source. Reference large artifacts by path, command, or URL plus the specific lines that matter. Every claim carries an evidence label; never record an unsupported claim as a fact. Keep entries short enough that the whole notebook stays readable in one pass.
