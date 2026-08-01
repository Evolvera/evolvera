# Decisions

## QA is one capability with CORE and FULL levels

- Keep one global `testing` skill and one dedicated `qa` agent. Do not split environment construction into a second QA skill or route testing through implementation builders.
- `CORE` proves only a declared bounded backend/core scope. `FULL` proves every acceptance-required integrated surface and requires a real browser for browser claims; DOM simulation and mocked critical paths remain partial/CORE evidence.
- Browser-context isolation never proves backend resource isolation. Stateful execution remains fail-closed unless every reachable resource is uniquely run-owned and disposable.
- An explicitly authorized FULL harness-build phase may change only an exact test-only write set, then stops for a selective checkpoint. A fresh read-only `qa` session on the new SHA owns the verdict, preventing self-certification.
- The QA agent is pinned to `openai-codex/gpt-5.6-sol` at `high`; its prompt stays lean and evidence-oriented, with conditional CORE/FULL references and regression evaluations.

## Explanatory clarity belongs to the global system prompt

- The global `SYSTEM.md` controls explanation quality; communication modes continue to control only surface cadence.
- In software work, assume working engineering literacy. Simplify the causal structure, not the technical level, and do not teach standard concepts unless asked or they are the actual confusion.
- Feynman-inspired structure activates for requested clarification or when a non-obvious mechanism is necessary: name the real subject, trace only the required causal chain, and expose the hidden assumption or failure boundary.
- Analogies are optional and must materially improve understanding, map to the real mechanism, and state their limit. Never force a persona or announce the technique.
- Plain language must preserve technical precision, uncertainty, evidence, caveats, safety constraints, and exact commands/identifiers.

## Agent tier consolidation and deep-research workflow (2026-07-30)

- Removed `builder-ultra`, `builder-light-design`, `scout-highspeed`, `deep-research-finalizer`, and `deep-search-master`. Old ultra work routes to `builder-heavy` (now GPT-5.6 Terra xhigh); routine design-system UI routes to `builder-design`; all exploration uses the single `scout`.
- Deep research is a skill (`skills/deep-research`): five researchers (creative, critical, explorer, methodical, skeptical — GPT-5.6 Luna xhigh) run in parallel; `deep-research-auditor` (GPT-5.6 Sol high) consolidates everything into the final cited report; the orchestrator relays the auditor output directly. No finalizer, no second synthesis.
- Plan-heavy uses three briefers (`plan-briefer` Sol high, `plan-briefer-fable` Opus 5 high, `plan-briefer-gpt55` GPT-5.5 high) and launches the final planner with a `anthropic/claude-fable-5` xhigh model override; the normal planner stays on Sol xhigh. Fable prompts stay concise/boundary-first, never request reasoning echo (`reasoning_extraction` refusal risk), and ground progress claims in tool results.
- Installers delete retired agent files on update so stale routes do not linger in installed harnesses.

## Builder routing separates model size, effort, and task shape (2026-07-30)

- `builder-light` is the cheap deterministic execution tier: `openai-codex/gpt-5.3-codex-spark` at `medium`. Use it only when the correct edit is locally decidable from the task plus visible code, with exact anchors and validation; broad discovery, hidden contracts, auth/data-flow judgment, lifecycle, serialization, or ambiguity route to `builder`.
- `builder` remains the normal development tier: `openai-codex/gpt-5.6-luna` at `high`. It owns bounded local implementation that needs ordinary module/API contract understanding, tests, serialization, lifecycle, migrations, auth/payment/data flow, and structured integration.
- `builder-heavy` remains the exceptional boundary tier: `openai-codex/gpt-5.6-terra` at `xhigh`. It owns host/external/live runtime operations and bounded exceptional formal/numerical/scientific correctness with an explicit oracle. Importance, shared files, auth, migration, or file count alone do not select heavy.

## Deep research supports public structured-data ETL (2026-07-30)

- Added `deep-research-data` (GPT-5.6 Luna xhigh, 45 turns) for official public APIs, open datasets, downloadable CSV/JSON/XLSX, reproducible temporary ETL, and data-provenance-aware findings.
- The five perspective researchers now also have `jina_read, bash, write` and must consider structured retrieval when it materially improves their angle. Their external access is read-only public `GET`/`HEAD`; any script/payload lives only in a unique `mktemp -d` directory under `/tmp`, with no credentials, project data, package installs, mutating requests, access-control bypass, or writes outside the run-owned temporary directory.
- Deep research now launches six parallel researchers. The auditor must verify API/dataset query, fields, units, population/geography, period/revision, formula, rounding, and methodology before retaining data-derived aggregates.

## Deep-research data keeps reproducible ETL artifacts (2026-07-30)

- For a structured-data investigation, the orchestrator creates one unique `<PROJECT_ROOT>/.pi/research/<slug>/etl` directory and passes it as the data agent's exact persistent write set. The data agent writes only `pipeline.py`, `derived.json`, and `manifest.json` there, and returns YAML whose `etl_artifacts` points to those files; the orchestrator writes the YAML separately as `findings/data.yaml`.
- `pipeline.py` is read-only, standard-library-first reproduction logic; `derived.json` contains only the retained normalized rows/series/aggregates; `manifest.json` records public source/query, retrieval/schema/units/period/methodology, transforms, hashes when practical, and reproduction command. Raw payloads remain temporary rather than persistent.
- The data agent never writes the narrative report. The auditor reads the data YAML and ETL package, excludes unsupported aggregates, and cites the official source URL rather than local artifacts in the final report.

## Deep-research data agent follows a Data → Information → Knowledge pyramid (2026-07-30)

- The data agent is an evidence-bound analyst, not merely an API/ETL executor. Raw public records stay temporary; `manifest.json` preserves their retrieval identity and schema. `derived.json` is the documented information layer, with stable selectors and metric/transform scope.
- A `knowledge_conclusions` YAML item is retained only when it traces to finding IDs and exact derived-data selector/transformation, separates measurement/comparison/inference/recommendation, states confidence, interpretation boundary, caveats, and decision relevance. Correlation or a descriptive trend never supports causal wording.
- The auditor must verify the complete Data → Information → Knowledge chain and exclude any aggregate or conclusion whose lineage, scope, or causal claim is unsupported.

## Deep-research data analyst is Terra xhigh and selectively invoked (2026-07-30)

- `deep-research-data` uses `openai-codex/gpt-5.6-terra` with `xhigh` and 70 turns because it owns bounded, reproducible data-analysis/ETL work rather than generic web research.
- Deep Research always launches the five perspective researchers in parallel. It adds the data analyst in that same wave only when exact official quantities, a time series/segmentation/reconciliation/join/calculation, quantitative verification, or a reproducible API/dataset chain materially changes the bounded answer. Qualitative/discovery questions and claims resolved by cited primary prose do not invoke it.
- The invocation decision is recorded in the auditor handoff; ETL artifacts exist and are audited only when the analyst ran.
