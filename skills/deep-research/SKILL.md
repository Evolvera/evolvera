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

Each prompt must be self-contained: exact topic/question, why it matters, time window, grounded starting URLs, official API/dataset candidates when known, and domain constraints. Each perspective researcher returns exactly one YAML findings document per its agent contract; do not ask it to write persistent project files or converge with another researcher.

Before launching the data researcher, create one unique research directory and exact persistent ETL path:

```text
RESEARCH_DIR=<PROJECT_ROOT>/.pi/research/<slug>
ETL_DIR=<RESEARCH_DIR>/etl
```

Pass absolute `PROJECT_ROOT`, `RESEARCH_DIR`, and `ETL_DIR` to `deep-research-data`. `ETL_DIR` is the data researcher's only authorized persistent write set. It must be new/empty and the data agent must create exactly `pipeline.py`, `derived.json`, and `manifest.json` there when structured data is successfully used. It still returns one YAML findings document; the orchestrator saves that response as `findings/data.yaml`. The data agent never writes the narrative final report.

The five perspective researchers may use compact temporary ETL when structured evidence materially improves their assigned angle. The `data` researcher is the specialist for official public APIs/datasets and acts as an evidence-bound data analyst: explicitly ask it to build the **Data → Information → Knowledge** chain. It must retrieve the smallest necessary data slice, normalize and define the information layer, verify methodology/units/periods, create/re-run the ETL package, and produce only decision-relevant knowledge conclusions with finding IDs, `derived.json` selectors, transformation, comparison/baseline when used, confidence, interpretation boundary, and caveats. It must distinguish measurement, comparison, inference, and recommendation; correlation never establishes causation. Perspective-researcher ETL remains temporary. The data specialist may persist only its three ETL artifacts in supplied `ETL_DIR`. All retrieval is read-only public `GET`/`HEAD`, with unique `mktemp -d` scratch under `${TMPDIR:-/tmp}`, no credentials/project data/package installs, no writes beyond declared ETL artifacts and scratch, and no bypassing access controls or rate limits.

## 3. Consolidate with the Auditor

Collect the six YAML outputs. Save each to `<RESEARCH_DIR>/findings/<agent>.yaml`; the data YAML must retain its `etl_artifacts` paths. Pass absolute finding paths to the auditor rather than inlining large structured outputs.

Launch `deep-research-auditor` with: the exact topic/question, decision context, all finding paths, the count of researchers that reported, and—for the data researcher—the absolute `ETL_DIR`, `pipeline.py`, `derived.json`, and `manifest.json` paths. The auditor reads the ETL package, verifies that its manifest/provenance supports retained aggregates, adjudicates evidence, resolves or preserves contradictions, and returns the final cited Markdown report as its message. The final report cites official sources from the manifest/findings, not local artifact paths.

## 4. Deliver

Relay the auditor's report to the user. Save it to a file only when the user asks. Do not launch additional synthesis or re-run researchers unless the auditor names a decision-relevant gap the user wants resolved.

## Failure Rules

- A researcher that fails or returns empty findings: retry it at most once; otherwise tell the auditor which angle is missing so the report records the gap.
- Auditor `BLOCKED`: report exactly which inputs were missing instead of improvising a summary yourself.
- Never fabricate findings, URLs, or excerpts to fill a missing angle.
