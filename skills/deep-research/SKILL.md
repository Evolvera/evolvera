---
name: deep-research
description: Deep external research workflow. Use for research questions that need multi-angle web or official structured-data evidence. Launches six researcher agents (creative, critical, explorer, methodical, skeptical, data) in parallel, then the deep-research-auditor consolidates every finding into one final cited report that the orchestrator relays directly to the user.
---

# Deep Research — Six Researchers, One Auditor

```text
research question
  → 6 researchers in parallel (creative, critical, explorer, methodical, skeptical, data)
  → deep-research-auditor: adjudicates evidence + contradictions, writes the final cited report
  → orchestrator relays the auditor's report directly
```

There is no finalizer and no second synthesis. The auditor's output is the deliverable.

## When to Use

- External/web research where evidence quality, contradictions, and multiple angles matter: markets, companies, people, technologies, claims, due diligence, statistics, or public official datasets/APIs.
- Not for codebase investigation (`scout`), not for a quick single-source lookup (direct `jina_read`).

## 1. Frame the Mission

Define before launching:

- the exact bounded question and the decision it supports;
- time window / recency requirements;
- grounded starting URLs when available (supply known primary-source URLs whenever precision matters);
- official API/dataset candidates and required measures, units, geography, period, and formulas when structured data matters;
- output language (default Portuguese).

## 2. Launch the Six Researchers in Parallel

One message, all six with `run_in_background: true`, agents: `deep-research-creative`, `deep-research-critical`, `deep-research-explorer`, `deep-research-methodical`, `deep-research-skeptical`, `deep-research-data`.

Each prompt must be self-contained: exact topic/question, why it matters, time window, grounded starting URLs, official API/dataset candidates when known, and domain constraints. Each researcher returns exactly one YAML findings document per its agent contract; do not ask them to write persistent project files or converge with each other.

The five perspective researchers may use compact temporary ETL when structured evidence materially improves their assigned angle. The `data` researcher is the specialist for official public APIs/datasets: explicitly ask it to retrieve and normalize the smallest necessary data slice, verify methodology/units/periods, and record query/field/filter/formula provenance. All researcher ETL is read-only and temporary: public `GET`/`HEAD`, unique `mktemp -d` directory under `${TMPDIR:-/tmp}`, no credentials/project data/package installs, no writes outside that temporary directory, and no bypassing access controls or rate limits.

## 3. Consolidate with the Auditor

Collect the six YAML outputs. Save each to `<PROJECT_ROOT>/.pi/research/<slug>/findings/<agent>.yaml` and pass absolute paths, or pass the YAML inline when the total is small.

Launch `deep-research-auditor` with: the exact topic/question, the decision context, all findings (paths or inline), the count of researchers that reported, the data provenance/ETL context when supplied, and the required report language. The auditor adjudicates evidence, resolves or preserves contradictions, and returns the final cited Markdown report as its message.

## 4. Deliver

Relay the auditor's report to the user. Save it to a file only when the user asks. Do not launch additional synthesis or re-run researchers unless the auditor names a decision-relevant gap the user wants resolved.

## Failure Rules

- A researcher that fails or returns empty findings: retry it at most once; otherwise tell the auditor which angle is missing so the report records the gap.
- Auditor `BLOCKED`: report exactly which inputs were missing instead of improvising a summary yourself.
- Never fabricate findings, URLs, or excerpts to fill a missing angle.
