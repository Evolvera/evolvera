---
name: llm-finetuning
description: Evidence-first workflow for production LLM fine-tuning. Use for dataset/provenance and annotation design, leakage-resistant splits, synthetic-data policy, SFT, LoRA/QLoRA, structured-output training, model-capacity ladders, evaluation/statistics, experiment receipts, promotion, shadow, canary, and rollback. Grounds decisions in the bundled production guide while separating reusable scientific principles from its broker-specific case study.
---

# LLM Fine-Tuning — Evidence-First Production Workflow

Use this skill to plan, audit, implement, evaluate, or operationalize supervised fine-tuning programs without confusing successful training, valid output structure, or lower loss with production competence.

Match the workflow depth to the request. A focused dataset audit does not require a complete training program; a production promotion decision does.

## Canonical Reference

The bundled reference is mandatory evidence for this skill:

```text
references/LLM_FINE_TUNING_PRODUCTION_GUIDE.md
```

Reference snapshot:

- title: `Guia de Produção para Fine-Tuning de Extração Semântica de Broker`;
- date: `2026-07-22`;
- SHA-256: `b1514c43a6e72a37e33abfe7fc3cbda54e40c17f8cfa9698625b8b7274f441ec`;
- basis: 21 primary/official sources plus an audited local case study.

Resolve the path relative to this `SKILL.md`. Read the sections relevant to the task before making scientific or production recommendations. For a full program, read at minimum:

- Executive Summary;
- sections 1 and 4–20;
- section 21 for source scope and limitations;
- the appendices when the task concerns the original broker case study.

The guide combines reusable methodology with project-specific evidence. Do not export its broker schema, metrics, model sizes, dataset counts, thresholds, one-call constraint, or G0–G9 decisions into another project unless that project's evidence independently requires them.

Authority order:

1. approved user outcome and safety boundary;
2. current repository/runtime evidence;
3. current primary specifications and official library/model documentation;
4. reusable scientific principles in the bundled guide;
5. project-specific examples in the guide, only when applicable.

When a version-sensitive external claim matters, verify the current official source. Do not present a vendor benchmark, model card, blog post, or historical guide value as current local fact.

## Activation Boundary

Use this skill for:

- fine-tuning feasibility and failure diagnosis;
- dataset acquisition, provenance, annotation, adjudication, and documentation;
- thread/entity/time/source/group-safe splits;
- synthetic examples, hard negatives, counterfactuals, and teacher-generated data;
- SFT, PEFT, LoRA, QLoRA, completion-only loss, chat templates, EOS, and truncation;
- structured-output models and constrained decoding;
- evaluation design, metrics, uncertainty, replication, and causal experiment families;
- model-capacity comparisons;
- promotion, sealed holdouts, shadow, canary, monitoring, kill switches, and rollback.

Do not activate it for generic prompt editing, ordinary inference integration, RAG-only work, or model-provider selection unless the decision materially affects a fine-tuning program.

This skill never grants authorization to train on private data, spend GPU/provider budget, open a sealed holdout, deploy, mutate an external service, or execute a real-world action. Obtain explicit authorization at the applicable boundary.

## Core Invariants

1. **Data and labels before hyperparameters.** Missing coverage, bad provenance, leakage, label ambiguity, and generator dependence cannot be repaired by rank, learning rate, epochs, or a larger model.
2. **Structure is not semantics.** Parse/schema validity or constrained decoding proves only structural acceptance; evaluate task meaning separately.
3. **Development is adaptive.** Once used for decisions, a product is not independent final evidence.
4. **Split the true dependency unit.** Rows sharing a thread, entity, document, user, episode, template family, source, or temporal causal chain cannot be treated as independent merely because their text hashes differ.
5. **Synthetic data is marked evidence, never hidden ground truth.** It may fill probes or training gaps but cannot prove real-distribution competence.
6. **Change one causal family at a time.** Preserve the rest of the training/evaluation contract or state explicitly that the comparison is non-causal.
7. **No denominator, no claim.** Every metric and safety statement names eligible opportunities, sample size, grouping assumptions, and uncertainty.
8. **A successful run is not a successful model.** Completion, lower loss, stable CUDA, and saved adapters are operational evidence, not quality evidence.
9. **Escalate capacity only after clean gates.** Compare larger models under the same data, prompt, schema, decoder, generation, and evaluation contract.
10. **Production remains fail-closed and reversible.** Promotion requires independent evidence, observability, rollback, and explicit authorization.

## Workflow

### 1. Reconcile the actual decision

Name the decision before collecting experiments:

- diagnose a failed candidate;
- design or audit a dataset;
- establish a baseline;
- compare training methods or capacity;
- validate a structured-output runtime;
- decide promotion or rollback.

Record:

- desired observable outcome;
- current capability and failure evidence;
- what must be preserved, changed, or intentionally removed;
- private/sensitive data boundary;
- runtime, cost, latency, and hardware constraints;
- actions that require separate authorization;
- the evidence that would falsify the current hypothesis.

If the request is “make it perfect,” replace that phrase with a finite product, frozen protocol, measurable error taxonomy, denominators, confidence statement, and explicit out-of-distribution limitation. Never promise universal perfection.

### 2. Build an evidence ledger

Classify material statements:

- `FACT`: directly observed in repository/runtime artifacts or supported within the cited source's scope;
- `INFERRED`: evidence-backed hypothesis requiring a falsification test;
- `UNKNOWN`: unresolved and not usable as fact;
- `POLICY`: approved project constraint, possibly more conservative than literature.

Inspect the smallest complete fine-tuning surface:

- source data, provenance, privacy, retention, and access controls;
- canonical target and annotation guideline;
- split/group construction and frozen manifests;
- tokenizer, chat template, prompt, serializer, schema, and decoder;
- training runner, masks, loss denominator, truncation, EOS, seed, and determinism controls;
- evaluation runner, metrics, slices, opportunity denominators, and raw failure taxonomy;
- model/base revision, adapter lineage, quantization, hardware, and dependency versions;
- receipts, hashes, promotion state, monitoring, and rollback artifacts.

Do not diagnose from filenames, aggregate loss, or a single benchmark summary. Trace the data and evaluation path that actually ran.

### 3. Close data, annotation, and split gates

Before tuning:

1. define the canonical target from evidence available at inference time;
2. preserve source and transformation provenance;
3. identify the indivisible dependency group for splitting;
4. separate development, sealed generalization, and future-real evidence;
5. audit exact duplicates, near duplicates, templates, generator families, labels, and contextual overlap;
6. double-annotate or adjudicate safety-critical and ambiguous cases;
7. quarantine unresolved targets instead of inventing convenient labels;
8. build a coverage matrix over meaningful semantic/behavioral slices;
9. distinguish balanced diagnostic suites from production-prior evaluation;
10. create dataset/model cards without exposing private examples.

A cell with no eligible real examples is `UNKNOWN`, not a demonstrated zero-error slice.

Synthetic or teacher-generated data must record generator/version, source prompt or policy, transformation family, review status, split eligibility, and relation to real examples. Keep generation families independent across train and final evaluation. Use matched positives/negatives and minimal counterfactual changes when humans verify the intended label relation.

### 4. Establish a trustworthy baseline and ceiling

Use the smallest baseline that can test the complete pipeline. Prove:

- canonical serialization and strict validation;
- prompt/completion boundary and active loss tokens;
- tokenizer/chat-template/EOS compatibility;
- zero unintended truncation;
- generation behavior and stopping;
- evaluation reproducibility;
- a human or strong-teacher ceiling adjudicated by humans where appropriate.

A smoke test of the decoder, schema, trainer startup, or GPU is not a model-quality benchmark. Label each result by what it actually proves.

### 5. Design the training contract

Prefer SFT when the task has canonical supervised outputs. For prompt-completion datasets, completion-only loss is often appropriate, but verify the mask and denominator in the actual runner.

Use LoRA/QLoRA as efficiency or feasibility choices, not assumed accuracy improvements. Quantization, rank, target modules, precision, optimizer, scheduler, context, and epochs are experiment variables with local evidence requirements.

For each run freeze or record:

- base model and exact revision;
- tokenizer, chat template, EOS/pad handling, and context limit;
- dataset/lineage/split hashes;
- prompt, target serializer, schema, decoder, and generation contract;
- precision/quantization and adapter configuration;
- optimizer, scheduler, effective batch, updates, seed, and stopping rule;
- hardware/software versions, deterministic controls, and known nondeterminism;
- validation cadence, selection metric, and experiment-family budget.

Do not add DPO/RL/preference optimization before a semantically competent SFT baseline and adjudicated preference data exist.

### 6. Use a causal experiment ladder

Recommended order:

1. audit data/labels/provenance;
2. prove split and generator independence;
3. reserve future-real evidence;
4. establish human/teacher ceiling;
5. retrain the smallest plausible model once under the clean contract;
6. if a reproducible capacity limitation remains, compare the next capacity tier under the identical contract;
7. replicate the selected configuration;
8. open sealed final evidence once;
9. run future-real shadow before any canary.

The concrete model sizes are project decisions. The broker guide's `0.8B → ~4B → ~8B` ladder is a case-study sequence, not a universal prescription.

One experiment family changes one causal concern. If data, prompt, model, decoder, and threshold all change together, report an integrated candidate comparison, not a causal conclusion.

### 7. Separate output validity from task quality

For structured outputs, maintain distinct gates:

- generation completion and stopping;
- strict parse and duplicate-key behavior;
- original schema/specification validity;
- semantic/task exactness;
- grounding and non-invention;
- safety-critical false positives/negatives;
- latency, memory, throughput, and failure recovery.

Constrained decoding can reduce structurally invalid outputs. It cannot make an incorrect intent, classification, extraction, or action correct. Test compiled grammars/decoders against the original schema with valid and invalid probes after relevant dependency changes.

Do not silently repair malformed output, fill defaults, retry, or use another model unless the approved product contract explicitly includes and evaluates that behavior.

### 8. Evaluate with denominators and uncertainty

Choose one authority metric that matches the complete product outcome. Use component metrics for diagnosis, not as substitutes.

Report as applicable:

- exact match or task success;
- field/event/action precision, recall, F1, and confusion;
- critical false-positive/false-negative classes;
- grounding, literal preservation, ordering, composition, guards, and abstention;
- real versus synthetic, source, time, group, length, position, ambiguity, and rare-slice results;
- parse/schema validity and stopping failures;
- latency p50/p95, throughput, memory/VRAM, OOM, and cost;
- numerator, eligible denominator, independent-group count, and uncertainty.

For zero observed failures in `n` independent Bernoulli opportunities, a useful one-sided 95% upper error bound is:

```text
upper_error = 1 - 0.05^(1/n)
```

This bound is invalidated or weakened by correlated groups, distribution shift, label error, post-selection, or an incorrect opportunity denominator. Use exact or preregistered interval methods for non-zero failures and report assumptions.

Evaluate selective abstention as a risk/coverage tradeoff. A model that abstains on everything may have no false positives and still fail the product.

### 9. Decide promotion conservatively

A candidate is not promotion-ready until:

- the complete authority metric and critical slices meet preregistered gates;
- safety failures are within the explicitly approved policy;
- configuration and artifacts are hash-bound;
- the result replicates sufficiently for the runtime's nondeterminism;
- sealed evidence was not used adaptively;
- future-real shadow observes actual distribution without unauthorized effects;
- monitoring, privacy controls, kill switch, and rollback are tested;
- latency/cost/hardware constraints pass;
- the authorized owner approves canary/deploy.

Opening a sealed holdout, spending substantial compute, uploading private data, deploying, or enabling real-world actions requires explicit authorization. A document, passing benchmark, or shadow run does not grant it.

## Required Experiment Receipt

Every material experiment should have a preregistration and a completion receipt:

```markdown
# Experiment <ID>

## Decision
[What decision this experiment can change.]

## Evidence State
- FACT:
- INFERRED hypothesis:
- UNKNOWN:

## One Variable Family
[Exactly what changes and why.]

## Frozen Contract
[Data/splits, prompt, tokenizer/template, target/schema, decoder, generation, metrics.]

## Configuration
[Base revision, PEFT/quantization, optimizer, updates, seed, software/hardware.]

## Gates
[Advance/reject thresholds, critical slices, runtime and safety barriers.]

## Privacy and Authorization
[Allowed data/runtime; forbidden external or destructive actions.]

## Results
[Numerators/denominators, slices, uncertainty, runtime, hashes.]

## Verdict
[ADVANCE | REJECT | BLOCKED | UNVERIFIED, with causal limits.]
```

Never fill preregistration fields retroactively to make an adaptive run appear confirmatory.

## Output Modes

Return only the artifact needed by the request:

- **Forensic audit:** evidence ledger, failure taxonomy, ranked hypotheses, discriminating tests, stop rules.
- **Dataset plan:** provenance/annotation contract, split unit, coverage matrix, leakage audit, synthetic policy, data card.
- **Experiment plan:** frozen contract, causal ladder, receipts, compute authorization points, validation.
- **Training implementation:** bounded code/config changes plus focused tests and reproducibility evidence.
- **Evaluation report:** authority metric, slices, denominators, intervals, failures, limits, promotion verdict.
- **Production protocol:** shadow/canary boundary, monitoring, incident triggers, kill switch, rollback, explicit approvals.

Keep project-private examples, predictions, labels, identifiers, adapters, secrets, and raw messages out of public reports. Use aggregate evidence and hashes unless the approved environment authorizes more.

## Stop Rules

Stop and return the smallest concrete blocker when:

- required data, labels, provenance, split independence, or evaluation code cannot be inspected;
- the proposed experiment uses development/final evidence adaptively without acknowledging invalidation;
- a critical real slice is empty but the requested claim assumes competence;
- continuation requires inventing label meaning or changing product semantics;
- the run would combine multiple causal families while claiming isolated causality;
- two runs fail without a new evidence-backed hypothesis;
- the requested claim depends only on lower loss, valid JSON, synthetic tests, vendor claims, or a cherry-picked seed;
- compute, external-provider access, sealed-holdout opening, deployment, or destructive action lacks authorization;
- privacy or licensing constraints are unresolved;
- required runtime/production observation is unavailable—report `UNVERIFIED`, not `PASS`.

## Completion Standard

Before declaring the fine-tuning decision complete, verify proportionately:

- the actual decision and affected product contract are explicit;
- guide sections relevant to the decision were consulted;
- project facts, inferences, unknowns, and policies are separated;
- data/label/split/leakage gates are closed or visibly blocking;
- experiment comparisons preserve a meaningful frozen contract;
- model-size or PEFT recommendations follow evidence rather than fashion;
- metrics include denominators, slices, uncertainty, and failure taxonomy;
- structured validity is not conflated with semantics;
- reproducibility, runtime feasibility, privacy, and rollback are addressed;
- no deployment or external action is implied without authorization.
