---
name: deep-research
description: Deep external research workflow. Use for research questions that need multi-angle web evidence; launches five perspective researchers in parallel and selectively adds a Terra xhigh structured-data analyst only when official data ETL materially improves the answer, then the deep-research-auditor consolidates one final cited report that the orchestrator relays directly to the user.
---

# Deep Research — Five Perspectives, Optional Data Analyst, One Auditor

```text
research question
  → 5 perspective researchers in parallel (creative, critical, explorer, methodical, skeptical)
  → optional Terra xhigh data analyst in the same parallel wave when structured data is material
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
- output language (default Portuguese);
- whether the data analyst is required, using the gate below.

### Data-analyst invocation gate

Launch `deep-research-data` only when structured-data work is materially needed to answer the bounded question, such as: a decision depends on exact official quantities or rankings; a time series, segmentation, reconciliation, calculation, or cross-dataset join is required; a claim needs quantitative verification beyond a source's stated prose; or the requested conclusion must be reproducible from an API/dataset.

Do **not** launch it for qualitative/discovery research, a claim answerable by cited primary prose, or merely because an API might exist. The five perspective researchers can use small temporary structured lookups when useful. If uncertain, assess whether the final conclusion would materially weaken without a reproducible data chain; launch the data analyst only when the answer is yes. Record this decision in the auditor handoff.

## 2. Launch the Perspective Researchers and, When Needed, Data Analyst

One message launches the five perspective researchers with `run_in_background: true`: `deep-research-creative`, `deep-research-critical`, `deep-research-explorer`, `deep-research-methodical`, and `deep-research-skeptical`. When the invocation gate passes, add `deep-research-data` to that **same parallel wave**; do not make it a later default stage.

Each prompt must be self-contained: exact topic/question, why it matters, time window, grounded starting URLs, official API/dataset candidates when known, and domain constraints. Each perspective researcher returns exactly one YAML findings document per its agent contract; do not ask it to write persistent project files or converge with another researcher.

Only when launching the data analyst, create one unique research directory and exact persistent ETL path:

```text
RESEARCH_DIR=<PROJECT_ROOT>/.pi/research/<slug>
ETL_DIR=<RESEARCH_DIR>/etl
```

Pass absolute `PROJECT_ROOT`, `RESEARCH_DIR`, and `ETL_DIR` to `deep-research-data`. `ETL_DIR` is the data analyst's only authorized persistent write set. It must be new/empty and the data agent must create exactly `pipeline.py`, `derived.json`, and `manifest.json` there when structured data is successfully used. It still returns one YAML findings document; the orchestrator saves that response as `findings/data.yaml`. The data analyst never writes the narrative final report.

The five perspective researchers may use compact temporary ETL when structured evidence materially improves their assigned angle. The optional `data` analyst is the Terra xhigh specialist for official public APIs/datasets and acts as an evidence-bound data analyst: explicitly ask it to build the **Data → Information → Knowledge** chain. It must retrieve the smallest necessary data slice, normalize and define the information layer, verify methodology/units/periods, create/re-run the ETL package, and produce only decision-relevant knowledge conclusions with finding IDs, `derived.json` selectors, transformation, comparison/baseline when used, confidence, interpretation boundary, and caveats. It must distinguish measurement, comparison, inference, and recommendation; correlation never establishes causation. Perspective-researcher ETL remains temporary. The data specialist may persist only its three ETL artifacts in supplied `ETL_DIR`. All retrieval is read-only public `GET`/`HEAD`, with unique `mktemp -d` scratch under `${TMPDIR:-/tmp}`, no credentials/project data/package installs, no writes beyond declared ETL artifacts and scratch, and no bypassing access controls or rate limits.

## 3. Consolidate with the Auditor

Collect the five YAML outputs, plus `data.yaml` only if the data analyst was launched. Save each to `<RESEARCH_DIR>/findings/<agent>.yaml`; the data YAML must retain its `etl_artifacts` paths. Pass absolute finding paths to the auditor rather than inlining large structured outputs.

Launch `deep-research-auditor` with: the exact topic/question, decision context, all finding paths, the count of researchers that reported, the recorded data-analyst invocation decision, and—only when the data analyst ran—the absolute `ETL_DIR`, `pipeline.py`, `derived.json`, and `manifest.json` paths. The auditor reads the ETL package when supplied, verifies that its manifest/provenance supports retained aggregates, adjudicates evidence, resolves or preserves contradictions, and returns the final cited Markdown report as its message. The final report cites official sources from the manifest/findings, not local artifact paths.

## 4. Deliver

Relay the auditor's report to the user. Save it to a file only when the user asks. Do not launch additional synthesis or re-run researchers unless the auditor names a decision-relevant gap the user wants resolved.

## Failure Rules

- A researcher that fails or returns empty findings: retry it at most once; otherwise tell the auditor which angle is missing so the report records the gap.
- Auditor `BLOCKED`: report exactly which inputs were missing instead of improvising a summary yourself.
- Never fabricate findings, URLs, or excerpts to fill a missing angle.
