# Production Guide for Broker Semantic Extraction Fine-Tuning

**Document date:** 2026-07-22
**Status:** research and decision guide; not authorization to deploy, execute orders, open GENERALIZATION, or mutate external APIs.

> **Executive verdict — stop tuning the current 0.8B.** The correct next move is not to change the learning rate, rank, prompt, or number of epochs. First close the data, label, and provenance gates: audit actual coverage, adjudicate critical labels, prove independence across generators and splits, and freeze a future-real pool. Task97 is structurally valid but semantically unsafe and rejected; therefore, it cannot be deployed. The 0.8B returns to experimentation only at G5, after G0–G4 are complete. Scaling capacity before then does not distinguish lack of evidence from model insufficiency.

## Executive Summary

**FACT — current result.** Task97 trained a fresh Qwen3.5-0.8B base with LoRA BF16, `r=8`, `alpha=16`, learning rate `1e-5`, seed `17`, context measured against the `1984`-token contract, and `3537` updates. With XGrammar, output was valid in `100/100` cases, with no invalid output and no cap hit. This was not sufficient: full operational accuracy was `0,18`, event exactness `0,59`, action exactness approximately `0,229`, guarded-action exactness `0`; there were `41` false-action rows, `38` false EXITs, and `18` broadened selectors. The gate passed as `false`. The production conclusion is unequivocal: the candidate fails and cannot be deployed.

**FACT — what the result does not mean.** Task96 was only a runtime smoke test, with no model loaded, training, or predictions: it verified `100/100` expected matches, `5/5` valid bases, and rejected `11/11` invalid probes. It demonstrates technical decoder closure in that run, not semantic model capability. It is also a fact that the current runner uses labels with loss only on the completion and performs one deterministic generation per row. Thus, “the prompt was lost in the loss” is not a supported diagnosis; the runner must not be falsely accused of losing prompt tokens.

**FACT + qualified INFERENCE — forensic diagnosis.** V58 presents a strong hypothesis of insufficient coverage: TRAIN contains `3.585` real/source rows and only five synthetic rows; among `374` real boards, `372` are SIGNAL and only one is UPDATE. Critical real cells, including action composition, boards with EXIT, guards, and multiple actions, are empty or extremely sparse; most synthetic critical coverage is concentrated in those five rows. The data indicate a coverage and prior cause, but do not prove it is the sole cause. Label quality, generator independence, 0.8B capacity, and inference distribution remain UNKNOWN.

**DECISION POLICY.** The program follows G0–G9: (G0) freeze and reject Task97; (G1) private coverage and label audit; (G2) prove the split, generator independence, and future-real pool; (G3) build canonical, real-heavy TRAIN with independently authorized synthetics and matched negatives; (G4) establish a strong offline human/teacher ceiling, with human adjudication; (G5) retrain the 0.8B once under the clean contract; (G6) only if data gates are clean and a capacity gap persists, first compare a dense instruct model of approximately 4B and then approximately 8B, always with exactly the same data, prompt, schema, and decoder; (G7) replicate; (G8) open GENERALIZATION once and use a sufficiently sized real holdout; (G9) run future-real shadow without orders, leaving any canary for later explicit authorization.

**MATERIAL LIMITATION.** “Perfect” is defined here as no observed errors on a frozen product, with operational exact match and safety gates satisfied. This never amounts to universal perfection. Even zero failures in `100` independent examples gives a one-sided 95% upper error bound of approximately `2,95%`; moreover, correlated rows, temporal shift, human annotation error, and contamination weaken the interpretation. NIST recommends realistic, representative datasets, documented methodology, and results disaggregated by segment, not a single number [6]. The result of this research is a discipline for making the next decision falsifiable, not a promise of future accuracy.

**NOT AUTHORIZATION.** This guide does not authorize opening GENERALIZATION, promoting a model, operating a broker, sending orders, mutating Google APIs, publishing private data, or reusing adapters, predictions, messages, symbols, identifiers, or secrets. The harness remains the owner of identity, state, risk, and execution.

## 1. Scope, definition of “perfect,” and evidence vocabulary

### 1.1 Exact objective

The product is a private semantic extractor that makes a single `generate` call per input. It receives the current message and the context permitted by the contract, and emits a single final JSON object in English, with keys and enums defined by the immutable schema. The output is an operational representation of intent, not a broker order and not a source of truth about account, position, or risk.

The target must simultaneously:

1. understand the authorizable intent of the current message;
2. preserve literal wording, scope, order, guards, and textual evidence;
3. not turn commentary, history, quotations, parent context, or hypotheses into actions;
4. represent `NO_ACTION` when facts are useful but do not authorize action;
5. follow the schema exactly, without post-processing that masks errors;
6. provide the harness with sufficient information without making decisions that belong to it.

### 1.2 What “perfect” can and cannot mean

**MEASUREMENT FACT.** For a frozen dataset, “observed perfection” means that every example receives an object that passes strict parsing, passes the original Draft 2020-12 schema, matches the canonical target on operational exact match, and produces no false action, false EXIT, or selector broadening. Components such as event, literal, or guard may explain failures, but do not replace exact match.

**QUALITY INFERENCE.** This concept is useful as a release gate for a finite product. It supports saying “we observed no errors on this product, under this configuration and protocol,” provided the product is independent, its denominators are published, and its provenance is frozen. It does not support saying “the model is universally perfect.”

Universal perfection cannot be established for four reasons:

- **Open population:** future messages may contain language, composition, noise, channels, or regimes absent from the sample.
- **Sample dependence:** multiple messages may be variations of the same thread, author, template, or episode; nominal `n` overstates the evidence.
- **Labels are not perfect observations:** humans may disagree, context may be insufficient, and the schema may not represent a semantic distinction. Annotation must reveal uncertainty, not hide it.
- **The system around the model changes:** tokenizer, decoder version, chat template, harness, sources, and operational distribution may change. Laboratory risk may differ from real-world operational risk [6].

“Perfect” also does not mean that the output is true about the external world. JSON Schema defines assertions and annotations about instances; validating the object does not verify balance, position identity, brokerage, or whether a price is real [9]. XGrammar constrains structure, not factuality or task semantics [11].

### 1.3 Required labeling

Every claim in this guide uses one of three classes:

- **FACT:** observed in a project artifact or directly supported by the cited published source.
- **INFERENCE:** working conclusion derived from facts; it has an explicit caveat and must be tested.
- **UNKNOWN:** unresolved by the artifacts; it cannot be presented as fact or used to justify scaling.

When a recommendation is product policy, it is marked **PROJECT POLICY**. A policy may be more conservative than the literature and must not be described as a published result.

## 2. Current forensic diagnosis

### 2.1 Task97: structure passed, semantics failed

| Item | Result | Class | Consequence |
|---|---:|---|---|
| Base | fresh, Qwen3.5-0.8B | project FACT | avoids confusing adapter inheritance with current training |
| LoRA | BF16, `r=8`, `alpha=16`, dropout `0` | project FACT | this is the audited configuration, not a universal recommendation |
| Optimization | LR `1e-5`, seed `17`, `3537` updates | project FACT | does not authorize concluding that LR/capacity is the cause |
| Decoder | XGrammar `0.1.32`, cap `0` | project FACT | positive structural/runtime gate in this run |
| Valid JSON/schema | `100/100`; invalid `0` | project FACT | precondition, not semantic quality |
| Event exact | `0,59` | project FACT | material semantic classification error |
| Full operational exact | `0,18` | project FACT | product failure |
| Action exact | approximately `0,229` | project FACT | actionable extraction failure |
| Guarded action | `0` | project FACT | critical cell with no evidence of competence |
| False action / false EXIT | `41` / `38` | project FACT | safety blocker |
| Broadened selector | `18` | project FACT | scope/literalness violation |

**Conclusion:** `valid=100%` does not compensate for `operational=0,18` or safety failures. There is no basis for selecting Task97, opening GENERALIZATION, or testing execution.

### 2.2 Task96: smoke test, not a model

Task96 had `status=PASS` for the technical smoke test, with zero updates, zero losses, and no model trained or loaded. The runner accepted `5/5` valid bases, found `100/100` expected matches, and rejected `11/11` invalid values. **FACT:** this is a decoder and runtime-closure result, not an extraction measurement. Task96 must not be conflated with a model benchmark, and `100/100` must not be used as semantic evidence.

### 2.3 The runner and the incorrect prompt-loss hypothesis

**FACT:** the training path in `train_unsloth_qwen35_08b_v62.py` renders the prompt and completion using the exact chat template, verifies the tokenized boundary, rejects truncation, masks prompt tokens with `-100`, and computes causal loss only on the unmasked completion tokens. The inference path constructs the current input, calls `model.generate` once per row with `do_sample=False`, and decodes only the new tokens.

**PROJECT POLICY:** keep completion-only loss. The input must remain the prompt; the canonical output must remain the only supervised completion. Unit tests should verify the mask, but a semantic failure must not be “fixed” by claiming prompt-token loss without evidence of a violation. What remains UNKNOWN is capacity sufficiency, label quality, data composition, and CUDA stability in future configurations.

**FACT:** the preflight measures the complete envelope without `truncation=True`, checks the boundary, and aborts if there is a risk. This is a training safeguard, not proof that the future production envelope will never be larger. For each version, run a zero-truncation preflight on the real reference set and measured operational envelope.

### 2.4 V58 coverage: strong evidence, cause not yet proven

V58 is an aggregate analysis and does not publish private text, symbols, predictions, or envelopes. Its main facts are:

- TRAIN has `3.590` rows: `3.585` real/source and five synthetic.
- Among `374` real/source boards, `372` are SIGNAL, one is UPDATE, and one is NO_ACTION.
- There are zero real/source examples of boards with partial+breakeven in the critical combination; the few occurrences of this board come from synthetics.
- The critical table reports zero real examples for board partial+BE in first/middle/last positions, guarded board, full EXIT board, two actionable updates plus neutral proxy, and composition of partial+BE with separate EXIT.
- For the board partial+BE cell with unmatched proxy/distractor, TRAIN has `0 real + 3 synthetic` and DEVELOPMENT requires a singleton case.
- There are `264` real/source non-board partial+breakeven controls, but these do not replace real boards; composition and context matter.

**INFERENCE:** the training prior may teach that a board is almost always SIGNAL and that critical combinations are synthetic. This plausibly explains action suppression and composition failures. **It is not proof of a single cause.** The coverage parser is deliberately conservative, and its low mapping rate does not allow concluding that unmapped rows are neutral. Label quality, generator/source independence, capacity, and inference remain open gates.

### 2.5 DEVELOPMENT, GENERALIZATION, and adaptivity

**FACT:** DEVELOPMENT is adaptive: it was used for prior decisions and analyses. Therefore, a result on it is regression/development evidence, not independent generalization. **FACT:** GENERALIZATION100 is freeze-only and was not opened by candidate Task97; the absence of candidate evaluation is neither success nor statistical failure.

**POLICY:** keep GENERALIZATION closed until code, prompt, schema, data, model, decoder, thresholds, and preregistered seeds are frozen. Once opened, use it only once per final candidate. A future holdout sampled from unused real messages and disjoint by time, source, and thread is mandatory; a synthetic suite never replaces it.

### 2.6 Competing diagnoses

| Hypothesis | Supporting evidence | What is still missing | Current decision |
|---|---|---|---|
| Data/coverage problem | real boards are almost all SIGNAL; critical cells are empty | private audit and causal ablation | G1–G3 first |
| Label problem | historical mixes, context, and contract may diverge | double annotation, adjudication, and ledger | G1/G4 |
| Independence problem | synthetic variants may share a family/template | semantic fingerprints and independent authorship | G2/G3 |
| Capacity problem | 0.8B may fail on composition after data are clean | clean ceiling and controlled comparison | G6 only |
| Optimizer problem | seed/CUDA and loss do not predict exactness | one family at a time, replication | do not search now |
| Decoder/runtime problem | root schema and integration may fail without constraints | differential probes and exact runtime | Task96 positive; continuous regression |

## 3. Product contract and target architecture

### 3.1 Non-negotiable contract

The target architecture is:

```text
private incoming message
        |
        +--> ingestion/harness: thread, reply, time, identity, position, risk, account
        |
        +--> permitted context: current_message + parent/root only to resolve instrument/side
        |
        +--> one LLM generate call, with constrained decoder
        |
        +--> a single final JSON object in English
        |
        +--> strict parse + original Draft 2020-12
        |
        +--> harness applies state, risk, quantity, broker symbol, idempotency
        |
        +--> execution only under external policy and explicit authorization
```

**PROJECT POLICY:** an input receives exactly one `generate` call, with no retry, repair, substring extraction, second call, auxiliary runtime model, or default filling. If the result is not a complete, strictly valid instance, it fails closed and does not become an order.

The model:

- interprets only `current_message` to decide whether an action exists;
- may use parent/root to resolve instrument or side when the contract permits;
- preserves literals, typos, and abbreviations rather than creatively normalizing them;
- does not invent an instrument, side, price, percentage, guard, quantity, or evidence;
- emits an action only when sufficient evidence exists in the current message and permitted context;
- leaves non-operational facts without action: unused facts must result in `NO_ACTION` according to the schema;
- for `PARTIAL_CLOSE` with no specified amount, uses `amount:SOME` as required by the contract and never invents a quantity;
- treats an explicit full-close literal as stronger than protection/partial-realization language when the contract so defines;
- handles multi-asset blocks independently, without broadening one block’s selector to another.

The harness, never the model, owns:

- thread and reply resolution;
- trade identity and position state;
- risk, quantity, and account;
- broker symbol, leverage, and any execution normalization;
- idempotency, order deduplication, authorization, and broker submission;
- final validation of permissions, limits, and account consistency.

The model never chooses `trade_id`, risk, quantity, account, broker symbol, leverage, or execution. These fields, if present in the broader system, are populated or validated by the harness and must not be taught as free decisions for the LLM.

### 3.2 Fact versus inference in the decomposition

**FACT:** a structurally valid output can be semantically wrong. **INFERENCE:** separating the LLM from execution reduces the blast radius of an interpretation, but does not eliminate false-action risk; the operational gate must still reject any improper action. **POLICY:** no downstream layer may “fix” invalid JSON to make it look like a successful generation. Fail-closed rejection and human review are preferable to an invented order.

Context should be compact. The “Lost in the Middle” literature found degradation when relevant information appears in the middle of long contexts [14]. Since state and risk belong to the harness, do not add narratives, calculations, or unnecessary history to the prompt to compensate for a weak model. Test evidence position, but do not increase context without measuring truncation, latency, and exactness.

## 4. Data acquisition, provenance, and splits

### 4.1 Source and privacy

**PROJECT POLICY:** message data remains private. The working dataset must record, in a private access-controlled environment, sufficient provenance for auditing: period, source, channel, thread, current message, reply relationship, edits, annotator, guideline version, adjudication status, and hashes. The public report contains only aggregates, matrices, counts, and evidence paths already public in the repository. Do not copy messages, predictions, symbols, envelopes, IDs, or secrets into public documentation, tickets, or experiment receipts.

Dataset documentation should record composition, collection process, recommended uses, and operational characteristics [8]. Collection must preserve the bytes needed to distinguish:

- the current message from parent/root;
- the original message from an edit;
- commentary, quotation, history, or execution report;
- a thread containing multiple actions from independent episodes;
- text containing an operational word that does not authorize an operation.

Erasing or normalizing these distinctions before annotation creates irrecoverable UNKNOWNs. Execution normalization, by contrast, belongs to the harness and must not be performed in the LLM target.

### 4.2 Split unit: thread first

**PROJECT POLICY:** the indivisible split group is the thread/episode, not the row. All messages in the same thread, reply chain, edit event, and linked semantic template must belong to the same split. If a current message depends on parent/root, the group includes the relevant chain. Hash-deduplicating isolated rows is insufficient: that allows context or sibling phrasing to cross between TRAIN and test.

Each group receives private control fields:

| Field | Required | Use |
|---|---|---|
| `thread_group` | yes | prevent leakage across splits |
| time interval | yes | separate past from future |
| source/channel/editorial family | yes | test independence |
| edit state | yes | avoid semantic duplicates |
| template fingerprint | yes | remove near-duplicates |
| regime/operational condition | when available | disaggregate shift |
| annotation and guideline version | yes | trace the label |

These names are control fields, not model outputs. Any reporting must remain aggregated.

### 4.3 Four required partitions

1. **TRAIN:** real-heavy, with all training groups and synthetics explicitly marked.
2. **DEVELOPMENT:** frozen before each experiment family; it may be adaptive, so it serves selection and regression.
3. **GENERALIZATION:** temporal/source/thread-disjoint, freeze-only, opened once after configuration freeze.
4. **Future-real shadow:** a later, real pool independent of all prior artifacts, decoded without orders; if opened and used for tuning, it is no longer final and must be replaced.

The split should separate time and source whenever there is sufficient volume. A random split may be a supplementary report, never the sole evidence. A temporal split alone may still share an author or template, which is why the source axis is needed. A source-only split may mix future data into TRAIN, which is why the temporal axis is needed. The thread unit prevents context leakage.

### 4.4 Future-real data and representativeness

**FACT:** GENERALIZATION100 is freeze-only and was not opened by Task97. **UNKNOWN:** its linguistic independence, production representativeness, and generator independence are not proven by the product name alone. **POLICY:** build a future-real pool with selection determined before inspecting labels; record the collection window, channels/sources, regimes, and counts by slice; adjudicate labels under the unchanged contract; freeze the hash and manifest. Do not use DEVELOPMENT wording, predictions, or examples derived from it.

The sample should include opportunities for both action and non-action messages, but do not manufacture a “nice” distribution and then call it production data. Maintain two reports: (a) a balanced suite to detect rare cells; (b) an evaluation calibrated to the production prior. The first reveals defects; the second estimates operational load. Neither replaces the other.

## 5. Annotation and adjudication

### 5.1 The canonical target

Each row must be annotated from the complete permitted text and the contract, without inferring facts known only to the broker or harness. In a private environment, the canonical target must record:

- whether the current message authorizes any action;
- operation/event and action sequence;
- quais evidências vêm de current, parent ou root;
- instrument and side only when grounded in the permitted scope;
- exact literals: numbers, percentages, price, guard, and abbreviations;
- current versus historical, intent versus outcome, command versus quotation;
- partial action, full action, or none; amount `SOME` only when specified by the contract;
- scope per block and action order;
- ambiguity, insufficient context, and need for abstention as provided by the schema.

If the message does not provide a position link, do not invent one. Label it as irresolvable or use the abstention representation already provided by the schema. Trade identity, state, and quantity are resolved only in the harness.

### 5.2 Two-pass protocol

**RECOMMENDED POLICY:** each critical case receives independent annotations from two annotators. First, each produces the target and marks evidence; then an adjudicator reviews only disagreements and a sample of agreements. The purpose is not to create an ornamental agreement statistic, but to locate ambiguous guidelines and labels that exceed the text.

The adjudicator should decide in this order:

1. Does the current message contain an instruction or only commentary/fact?
2. Is there negation, a condition, a quotation, history, or a past outcome?
3. Are there one or multiple actions, and in what order?
4. Is each field grounded in permitted text?
5. Does parent/root resolve only what policy permits?
6. Should the output be `NO_ACTION` due to insufficient evidence?
7. Does the schema express the distinction without inventing a default?

Preserve the original disagreement, the reason for the decision, and the guideline version. Unresolved cases must not silently enter as a “convenient” label; quarantine them or use a category explicitly supported by the schema.

### 5.3 Strong human/teacher ceiling

G4 establishes an offline ceiling: trained humans and, if used, a strong teacher propose outputs in the same schema; the final decision is human and adjudicated. A teacher or rule is a source of candidates, not ground truth. Compare:

- anotador individual;
- consenso humano;
- teacher forte revisado;
- modelo candidato.

If humans materially disagree on a slice, the model score cannot be used as if the target were exact. Revise the guideline, expand permitted context, or mark ambiguity. A teacher may help cover paraphrases, but synthetic instruction-tuning results on other tasks do not guarantee correct financial labels [12][13].

### 5.4 Counterfactual pairs and hard negatives

**Published FACT:** human-augmented counterexamples can change a minimal property to invert the label without losing coherence [17]. **INFERENCE:** use this as an invariance probe, not proof of generalization. Create pairs in which a minimal change alters only the target field: action to no action, full EXIT to partial, broad selector to narrow scope, guard present to absent. Each pair is human-reviewed; never copy DEVELOPMENT wording.

Hard negatives should come from real false-action cases: “EXIT” in history, “action” in commentary, legacy/adaptive status without a command, a quotation of an unsafe instruction, or past-outcome language. Each negative should have a matched positive when possible. The goal is to reduce lexical dependence without teaching a list of words as a rule.

## 6. Semantic coverage matrix

The matrix is a data and test design tool, not proof of sufficiency. Require a known denominator for every cell and record `real`, `synthetic`, `development`, `generalization`, and `shadow` separately.

| Dimension | Minimum slices | Why it is critical |
|---|---|---|
| Operation | SIGNAL/OPEN, UPDATE, full EXIT, partial EXIT, NO_ACTION | separates event from action |
| Scope | current, parent/root resolving a field, omitted | prevents action originating outside current |
| Polarity | affirmative, negated, conditional, quotation, historical | reduces false action and false EXIT |
| Composition | one action, two independent actions, action + neutral, EXIT + partial | tests atomicity and order |
| Guard | stop, target, breakeven, compound condition, and absence | safety cell |
| Literalness | typo, abbreviation, price, percentage, unspecified quantity | prevents invention/normalization |
| Selection | narrow scope, explicit selector, distractor, and unmatched row | measures broadening |
| Position | evidence at beginning, middle, end; multi-line board | tests positional attention |
| Source | unseen source/channel/thread | measures independence |
| Time | past, present, future, edited | prevents confusing outcome with command |
| Length | short, medium, maximum envelope | detects truncation and Lost in the Middle |
| Ambiguity | sufficient, insufficient, and contradictory context | calibrates abstention |

### 6.1 Reading the V58 matrix

Known aggregate coverage must be preserved as a diagnostic:

| Critical cell | Real/source TRAIN | Synthetic TRAIN | DEVELOPMENT |
|---|---:|---:|---:|
| Board partial+BE with distractor | 0 | 3 | 1 |
| Board partial+BE in first position | 0 | 3 | 1 |
| Board partial+BE in middle position | 0 | 0 | 0 |
| Board partial+BE in last position | 0 | 1 | 0 |
| Board two-action + proxy neutro | 0 | 0 | 0 |
| Board partial+BE separado de EXIT total | 0 | 0 | 0 |
| Board guarded | 0 | 0 | 0 |
| Board EXIT total | 0 | 0 | 0 |
| Board partial | 1 | 4 | 1 |
| Non-board partial+BE control | 264 | 0 | 5 |

**FACT:** the five synthetics do not cover middle, EXIT, guarded, or two actions plus neutral. **INFERENCE:** adding only cosmetic variations from the same generator does not close the matrix. **POLICY:** critical real cells are non-negotiable for any readiness claim; synthetics can create probes and reduce gaps, but never prove that the system learned real language.

The matrix must include matched negatives: for each relevant action, a case that preserves the vocabulary and changes only the status to commentary, history, negation, or lack of authorization. This is especially necessary for false-action and false-EXIT. Evaluation-suite balancing must not be confused with the production prior; both should be reported.

### 6.2 Source and generator coverage

A row with a new hash is not necessarily independent. V6.1 already showed that three variants from the same generator can reuse clauses, wrappers, literals, and structure. **POLICY:** TRAIN, DEVELOPMENT, and GENERALIZATION must have independent authorship/generation families, separate semantic catalogs, and varied styles and orderings. The audit removes wrappers and references before semantic fingerprinting; it tests near duplicates, template overlap, and clause sharing. Independence must be demonstrated by the process and audit, not inferred from a hash.

## 7. Synthetic data policy

### 7.1 What synthetic data can do

**Published FACT:** Self-Instruct reports benefits from synthetic instructions filtered for invalidity and similarity in its experiments, but this is not a demonstration of financial extraction [12]. Data generated by a strong teacher may also help instruction tuning on tasks described in the respective papers [13].

**POLICY:** synthetic data serves to:

- fill a cell already identified as missing;
- generate minimal contrasts and matched negatives;
- explore first/middle/last positions, guards, composition, and references;
- create property and regression probes;
- make a rare case explicit for later verification against real data.

Synthetic data must include provenance `source=synthetic`, generator family, guideline version, and review status. It must never appear in a report as evidence of real behavior.

### 7.2 What synthetic data cannot do

Do not accept data automatically because it validates against the schema. Do not produce labels from DEVELOPMENT. Do not use a shared generator for TRAIN and GENERALIZATION. Do not fill an entire matrix with synthetic data and call it real coverage. Do not duplicate the same cell three times and call them three independent examples. Do not let an artificial `NO_ACTION` proportion dominate the prior without a recorded hypothesis.

The V6.1 matrix had `150` positive and `150` synthetic NO_ACTION examples, approximately `50%` NO_ACTION, while the V5.8 history was approximately `25%`. **FACT:** the change coincided with worse retention of positive actions, without proving isolated causality. **INFERENCE:** polarity weighting and historical retention require ablation. The runner allows completion weighting for synthetic positives, but the weight must be chosen before evaluation, not adjusted after seeing the result.

### 7.3 Mixing and calibration

**STARTING HYPOTHESIS, not a universal fact:** begin with balanced exposure to rare cells during learning, while keeping real data as the effective majority and synthetics labeled; then calibrate to the production prior on a separate product. No optimal proportion has been published for Telegram trading extraction. Test real-only, controlled synthetic, real-heavy mixture, and positive weighting in families of up to three runs. Report both the balanced suite and the production prior.

## 8. Canonical serialization and leakage prevention

### 8.1 Serialization

The target must be a single canonical JSON object, with no explanatory text, using English JSON keys and enums. Define and version a stable key order, number representation, Unicode escaping, handling of `null` versus missing fields, and array format. Order does not change JSON semantics, but stable serialization reduces loss noise and makes hashes/receipts reproducible. The parser must reject duplicate keys; Draft 2020-12 notes that document behavior with duplicate keys is undefined and lexical details are outside the scope of validation [9].

**POLICY:** comparison canonicalization occurs after strict parsing and before exact match, without erasing a semantic difference. Do not reorder or fill fields to rescue an invalid prediction. The training target and evaluated output use the same canonical serialization. The original schema remains frozen; any compiled grammar is derived and has its own hash.

### 8.2 Leakage ledger

Before each training run, generate a private ledger that verifies:

- zero exact reuse de envelope/corrente de DEVELOPMENT;
- zero prediction text in TRAIN;
- zero acesso a GENERALIZATION e shadow;
- zero thread group cruzando split;
- zero near-duplicates above the threshold decided before inspection;
- zero critical clauses shared between the TRAIN and GENERALIZATION generators;
- zero evaluation targets used as prompt examples;
- hashes for code, schema, prompt, tokenizer, dataset, lineage, and model;
- ausência de truncamento;
- owner-only access protection.

Isolated domain literals are not leakage; complete text, envelope structure, and similar phrasing may be. The ledger should produce public aggregates while preserving detailed evidence in a private location.

## 9. Capacity ladder

The ladder is causal only if data and labels are clean. There is insufficient evidence to declare that 0.8B is definitively the current root cause.

### G5 — retreino controlado do 0,8B

Retrain one Qwen3.5-0.8B configuration on the canonical, real-heavy dataset and closed splits. Keep completion-only loss, exact chat template/EOS, one deterministic generation, the original schema, and the approved decoder. The historical Task97 configuration is a comparison point, not a prescription that its hyperparameters are optimal. Measure without truncation and report loss only as a diagnostic.

### G6 — approximately 4B, only after the data gate

If the 0.8B still fails on composition, coreference, or guards with adjudicated labels, real cells present, independent generators, a correct decoder, and zero distribution problems, compare one dense instruct candidate of approximately 4B. Keep exactly the same TRAIN, prompt, schema, tokenizer/output contract, generation budget, and evaluation. Benchmark local VRAM, OOM, prefill, decode, and p50/p95 before full training. This guide makes no GPU-fit claim.

QLoRA may be used as a memory-feasibility treatment because it trains adapters through a frozen quantized base model [5]. This does not assume an accuracy improvement. Vendor claims about VRAM and speed do not replace local measurement [19].

### G7 — aproximadamente 8B, se o 4B ainda for insuficiente

Only if 4B passes the data and runtime gates but retains a reproducible capacity failure, test approximately 8B under the same contract. Do not simultaneously change the mix, prompt, decoder, seed, or schema. If 8B improves the average but worsens false-action, false-EXIT, literal, or guard performance, reject it.

### Regras da escada

- Do not move up a tier to compensate for label error or EMPTY coverage.
- Do not claim that larger is better based on InstructGPT: the published result concerns broad instruction following and involves demonstration/preference stages, not this deterministic extraction [13].
- Do not invent a card, exact VRAM, or capacity for the Qwen3.5-0.8B checkpoint.
- Higher rank may increase trainable capacity, but may also overfit and does not create missing examples [3].
- Select using the operational vector and replication, never lower loss.

## 10. Approved training recipe

### 10.1 Fixed foundation

**POLICY:** SFT is an appropriate initial method for teaching correct responses in a fixed format and classification/extraction tasks [1]. The dataset is prompt-completion: the prompt contains only permitted context; the completion contains the final object. TRL documents loss only on the completion for prompt-completion [2].

The minimum recipe is:

1. validate the schema and canonical serializer before training;
2. validate the lineage of every occurrence and row hash;
3. render with the model's exact chat template;
4. verify EOS alignment with the template; TRL warns that Qwen models require this compatibility to terminate correctly [2];
5. tokenize without truncation and abort if any row exceeds context;
6. mask the prompt with `-100`, leaving the completion active;
7. run SFT with LoRA/PEFT for rapid ablations; LoRA freezes base weights and trains low-rank matrices [4];
8. record updates, losses, config, seeds, hashes, and receipt;
9. evaluate without modifying the prompt, target, or output;
10. save the adapter privately with owner-only access; do not include it in this guide.

### 10.2 Loss and hyperparameters

Keep completion-only loss. If synthetic-row weights are used, apply them only to active completion tokens, never the prompt. Record the active denominator. Test the implementation with a minimal row and a known mask.

**POLICY:** one experiment family changes one variable: data retention/weight, mix/polarity, diversity, learning rate, scheduler, rank/target modules, epoch rule, prompt, or model. Do not combine families. Up to three runs per family is a project search limit, not a statistical law. Use additional seeds only when preregistered to estimate variance; do not select the most convenient.

Do not use train loss as a quality proxy. Local history shows a configuration with lower loss and semantic regression; this is direct evidence against the proxy, not a general optimization theory. Report loss alongside exact match, safety, and slices.

### 10.3 Context, EOS, and generation

The chat template is a model artifact and must be hash-bound. Test `enable_thinking=False` as the current runner baseline because the contract requires one final output and one call; a reasoning mode would add tokens and leakage surface. If a candidate uses another mode, record it as a variable and measure it. Do not insert chain-of-thought into the schema, dataset, or report.

Generation must be deterministic, without sampling, with one call and one object. `max_new_tokens` is a safety cap, not a reason to accept truncation. If the cap is hit, record a failure and do not try another call.

### 10.4 DPO/RL

Do not use DPO, RL, or preference optimization before a semantically competent SFT baseline and adjudicated preference data exist. DPO is described in its papers as a simple preference loss, but the evidence concerns general alignment, not financial extraction [20]. An “accepted output versus rejected output” pair is useful only after verifying that the preference is semantic and grounded. Preference training does not correct missing ground truth or authorize relaxing the schema.

### 10.5 Model card and data card

Each candidate must have a private **model card** and an aggregated projection: intended and unintended uses; base and revision; precision/quantization; LoRA and training; hash-bound prompt, schema, tokenizer, and decoder; datasets and splits; metrics by slice; known limitations; incidents; local latency/VRAM; license; promotion, shadow, and rollback status. Explicitly state that it does not choose trade identity, risk, quantity, account, broker symbol, leverage, or execution.

Each data product must have a **data card**: motivation; real/synthetic composition; aggregated period and source; thread-split policy; annotation/adjudication; coverage matrix; near-duplicate and leakage audit; label uncertainty; recommended and prohibited uses; retention, privacy, and permissions; hashes; and a replacement rule when GENERALIZATION or shadow is opened. No card includes a message, prediction, symbol, ID, private label, adapter, or secret. Datasheets recommends documenting composition, collection, and uses [8].

## 11. Experimental protocol and decision DAG

### 11.1 Receipt contract

Every experiment must be preregistered with:

```text
ID and date:
FACT / INFERENCE for the hypothesis:
Single variable changed:
Constantes preservadas:
Dataset, lineage, prompt, schema, tokenizer, modelo e decoder:
Split used for selection:
Seed(s) e motivo:
Training and generation configuration:
Preflight de tokens e cap:
Primary metrics and slices:
Safety gates:
Advance/reject criterion:
Remaining family budget:
Resultado agregado, receipt e SHA256:
Decision and next action:
```

A receipt never contains a private message, raw prediction, symbols, IDs, secrets, or adapter. A public receipt contains only authorized aggregates and hashes.

### 11.2 Final receipt template

```text
Status: COMPLETE | BLOCKED | REJECTED | ADVANCES
Updates/errors/cap: aggregates by split and slice
Exactness e safety: numeradores, denominadores, bounds
Runtime: version, schema/grammar hash, latency, VRAM
Reproduction: result and divergences
Decision: retain, reject, or advance; rationale
```

Preregistration comes before execution; the receipt comes after. Never fill in a receipt retroactively to turn adaptive exploration into a causal experiment.

### 11.3 DAG

```text
G0 congelar/rejeitar Task97
        |
G1 auditoria privada de coverage + labels
        |
G2 thread/time/source splits + independence + future-real
        |
G3 canonical real-heavy TRAIN + independent synthetic data + matched negatives
        |
G4 ceiling humano/teacher forte offline, human-adjudicated
        |
G5 one clean 0.8B configuration
        |
        +--> data/label/runtime failure --> fix the corresponding gate, do not scale
        |
        +--> zero-invalid but semantics remain poor, clean evidence
                       |
                 G6 compare ~4B, same contract
                       |
                 still insufficient? --> G7 ~8B, same contract
                       |
                 selected --> exact replication
                       |
                 G8 open GENERALIZATION once + adequately sized real holdout
                       |
                 approved --> G9 future-real shadow, no orders
                       |
                 only after review and explicit authorization --> possible canary
```

### 11.4 Executable G0–G9

**G0 — freeze/reject.** Mark Task97 as a failed candidate; preserve aggregate evidence; do not open GENERALIZATION, promote, or train against the result.

**G1 — audit.** Audit occurrences, historical contract, `current/parent/root` mix, labels, grounded fields, ambiguity, duplicates, and critical cells. Quarantine disagreements; do not silently rewrite real data.

**G2 — independence.** Build splits by thread, time, and source; prove that the GENERALIZATION generator and author do not share a catalog/clause with TRAIN/DEVELOPMENT; separate a future-real pool before viewing labels.

**G3 — clean data.** Build TRAIN with non-negotiable critical real data, independently tagged synthetics, matched positives/negatives, and one serializer. Balance rare cells without claiming that the balance reflects production.

**G4 — ceiling.** A strong human/teacher generates an offline reference; adjudicate conflicts; measure the ceiling by slice and record where the contract itself is ambiguous.

**G5 — 0.8B.** One clean run with exactly the same runner and contract. Accept only if semantically competent and free of safety failures.

**G6 — 4B.** Only if G5 fails with clean evidence of a capacity limitation; benchmark locally first; keep everything else the same.

**G7 — 8B.** Only if 4B fails for the same reproducible limitation; no promise of improvement.

**G8 — final evidence.** Select, replicate, freeze, open GENERALIZATION once, and evaluate a real holdout with sufficient denominators. The result remains sample evidence.

**G9 — shadow.** Run on future-real data without sending orders; compare with humans/the legacy harness; record incidents and drift. Canary requires explicit authorization, an execution policy, and an independent kill switch.

### 11.5 Cause decision matrix

| Observed pattern | Most likely problem | Confirmatory test | Action | What not to do |
|---|---|---|---|---|
| critical cell EMPTY/zero real | data/coverage | add source-disjoint real data and learning curve | G1–G3 | increase rank |
| humans disagree or field is absent from the text | label/contract | double annotation and adjudication | guideline/quarantine | train on an invented label |
| high synthetic score, low real holdout | generator/independence | real-only versus mix, family-disjoint | rewrite generators | call synthetic data proof |
| clean data, reproducible composition/guard errors | capacity | same recipe on ~4B | G6 | declare 0.8B the root cause prematurely |
| variation across identical configs | optimizer/runtime | replication and deterministic controls | stabilize/measure | cherry-pick a seed |
| invalid/oneOf/cap/EOS | decoder/runtime | differential probes, tokenizer, and schema hash | fix runtime | parser repair/retry |
| schema 100%, low semantic score | content/data/capacity | full exact and slices | return to data/ceiling | use validity as proxy |

The matrix produces a hypothesis, not automatic causality. Every strong conclusion requires changing one variable and repeating on a non-adaptive split.

## 12. Constrained decoding and runtime contract

### 12.1 Two distinct gates

**Published FACT:** XGrammar states that constrained decoding provides structural correctness [11]. **Project FACT:** XGrammar `0.1.32` produced `100/100` valid outputs and zero cap hits in Task97, while semantics failed. **INFERENCE:** structure is necessary but insufficient; maintain separate gates:

1. structural: complete output, strict parse, no duplicates, accepting state, validation against the original Draft 2020-12 schema;
2. semantic-operational: exact match, grounding, action, safety, literalness, scope, order, and slices.

The original Draft 2020-12 schema is immutable and the sole final validator. The grammar compiled for XGrammar is a decoding artifact. Its equivalence must be tested differentially, never assumed. Do not relax `oneOf`, enums, required fields, arrays, references, or limits to make an output pass.

### 12.2 One call, one output, fail closed

The approved runtime is:

1. load the model, processor, tokenizer, and schema with hashes;
2. compile the decoder before generation;
3. render only the permitted prompt and obtain the generation prompt;
4. make one `generate` call with a grammar mask at every step;
5. accept EOS only if the grammar state is accepting;
6. reject cap hits, partial JSON, extra text, duplicate keys, loose parsing, or invalid schema;
7. validate the complete text against the original Draft 2020-12 schema;
8. pass the object to the harness, which still applies all policies.

Prohibited: removing fences, searching for a JSON substring, fixing quotes, parser repair, filling defaults, normalizing missing fields, automatic retry, a second model, or a second call. A rejected output is a measurable failure. XGrammar does not turn an incorrect intent into a correct one.

### 12.3 Decoder release suite

For every change to XGrammar, Transformers, tokenizer, model, schema, or processor, run valid and invalid probes:

- each branch of nested unions and overlapping branches;
- missing required field, extra property, incorrect enum/const, and incorrect type;
- null versus absent;
- arrays at the boundaries;
- escaped Unicode and boundary numbers;
- applicable `$ref`/recursion;
- duplicate key;
- truncated JSON and early EOS;
- cap one token before and after valid closure.

Record counts, stop reason, token count, accepting state, hashes of the original and compiled schemas, and the original validator's result. LM Format Enforcer `0.11.3` was reported as unsound for nested unions in this case; do not use it for the schema without a new approval suite. This conclusion is limited to the tested case, not a universal condemnation of future versions.

Transformers documents that `LogitsProcessor` alters scores during `generate` and that beam search may require subsequent normalization [10]. Since the product requires deterministic generation in one call, avoid unnecessary combinations of beam/warper. If any configuration changes, test the effective order of the mask and processor.

## 13. Evaluation, severity, and statistics

### 13.1 Metric authority

**Authoritative metric:** full operational exact, meaning the entire object matches the canonical target and passes all gates. Components are diagnostic; they cannot hide a safety failure.

| Family | Metric | Severity |
|---|---|---|
| Structural | parse, schema-valid, accepting state, cap, duplicates | blocking on failure |
| Event | event exact/F1 and confusion matrix | high |
| Operational | full exact and exact sequence | critical |
| Action | precision, recall, F1; action-set exact | critical |
| Safety | false-action, false-EXIT, selector broadened | blocking |
| Literal | price, percentage, typo, abbreviation, amount | high |
| Guard | presence, type, value, and linkage | critical |
| Grounding | current versus parent/root and field evidence | critical |
| Composition | atomicity, order, and independent actions | critical |
| Selective | abstention/NO_ACTION, coverage, and conditional risk | safety policy |
| Runtime | p50/p95 end-to-end, prefill/decode, VRAM, OOM, cap | release |

Action precision/recall/F1 are useful, but a high average can hide a false EXIT. Report exact match by field, but never replace whole-output exactness. The system must report how many cases were eligible for each metric; without a denominator, `0/0` is not zero errors.

### 13.2 Required slices

For each metric and gate, report `n`, numerator, denominator, and interval when applicable, by:

- role/event: SIGNAL, UPDATE, EXIT, NO_ACTION;
- mode: current, parent, root, omitted;
- polarity: affirmative, negated, conditional, quotation, historical;
- aggregated source, channel, thread family, and time window;
- short/long and beginning/middle/end position;
- one- or multi-line board;
- single/multi-action;
- guard present/absent and guard type;
- literal explicit/omitted/typo;
- real versus synthetic;
- ambiguous/clear;
- false-action and false-EXIT opportunities.

An empty cell is `UNKNOWN`, not zero. A slice with one observation does not support `High` confidence. The coverage suite is deliberately balanced; the production report additionally uses the real prior without removing the diagnostic suite.

### 13.3 Selective abstention

**Published FACT:** selective classification allows trading coverage for lower risk using a reject option [15]. **INFERENCE:** if the schema already provides a safe representation of no action/insufficient evidence, calibrate abstention on DEVELOPMENT to reduce false-action and false-EXIT, and measure the recall cost. Do not create a new field or relax the schema.

**POLICY:** abstention must not mask incompetence: report coverage, conditional risk, recall of required actions, and distribution by slice. If the model simply converts every action to NO_ACTION, false-action falls but the product fails by omission. The gate must require a predefined coverage/recall floor and zero observed safety violations on the corresponding product. Do not choose a threshold after opening GENERALIZATION.

### 13.4 Coverage and property testing

Coverage-driven testing has been proposed to reveal rare behaviors that manually labeled datasets may not cover [16]. Here, the equivalent is a semantic text matrix, not a claim of neuron coverage. Generate label-preserving and label-changing transformations offline, review human samples, and verify:

- irrelevant changes do not alter the object;
- negation/temporality alter only the expected target;
- adding a neutral line does not broaden another line's action;
- moving evidence between beginning/middle/end preserves semantics;
- parent/root resolves a field but does not create an event;
- a partial action without an amount remains `SOME`;
- the selector does not include a distractor.

A violation is diagnostic, not necessarily a dataset error; review the metamorphic relation with a human.

### 13.5 Latency and memory

Measure on the actual local hardware used, without extrapolating vendor claims: prefill tokens/s, decode tokens/s, p50/p95 for the full call, peak VRAM, OOM, cap hits, and compilation cost. Compare exactly the same prompt and output size across candidates. A model that improves semantically but violates p95, stability, or isolation does not pass the runtime gate. No claim that a given model fits on the GPU is made before the local benchmark.

## 14. Confidence and sample limits

For zero observed failures in `n` independent Bernoulli trials, the one-sided 95% upper error bound is:

```text
upper_error = 1 - 0,05^(1/n)
```

To plan a zero-failure gate with target true error `t`, solve:

```text
n >= ceil( ln(0,05) / ln(1 - t) )
```

| Maximum target error | Minimum n, zero failures, one-sided 95% |
|---:|---:|
| 1% | 299 |
| 0,5% | 598 |
| 0,1% | 2.995 |
| 0,05% | 5.990 |
| 0,01% | 29.956 |

**Statistical FACT:** exact binomial methods are appropriate when there are few failures or a small sample [7]. **INFERENCE:** `0/100` does not mean zero true error; under ideal assumptions, the bound is approximately `2,95%`. `0/1.000` is approximately `0,30%` at 95%. For a rare slice with `n=10`, `0/10` still allows an upper bound of about `25,9%`.

Required assumptions: independent opportunities, the same target population, a correct error definition, and error-free labels. Rows from the same thread, author, or template are correlated; the nominal denominator must be accompanied by the number of independent groups or an effective-sample-size analysis. The future temporal distribution may not be IID. If only some rows in a slice can produce a false action, use the denominator of false-action opportunities, not the overall total.

For nonzero failures, use an exact binomial interval or a preregistered method; do not choose Wilson, normal, or bootstrap after seeing the result. Report intervals by slice. “High confidence” requires at least two independent sources for a published claim when applicable, and in this project also requires independent operational evidence; a single adaptive suite does not merit that label.

## 15. Promotion, replication, shadow, canary, and rollback

### 15.1 Candidate gate

A candidate may advance only if, on the development product selected before GENERALIZATION:

- schema-valid with strict parsing and no failures;
- full operational exact meets the preregistered target;
- false-action, false-EXIT, and broadened selector remain at zero observed;
- all critical slices have adequate denominators and no critical UNKNOWN cell is hidden;
- there is no truncation or cap hit;
- configuration and hashes are complete;
- there is no regression in the permitted regression history.

Since current Task97 has `41` false actions, `38` false EXITs, and `18` broadened selectors, it does not pass.

### 15.2 Replication

Rerun the frozen configuration in a new workspace, with the same bytes, seed, and decoder. Compare the full vector, safety, loss, and aggregate taxonomy. If CUDA exhibits nondeterminism, preregister the replication/majority rule; never select a favorable run. A failed replication lowers confidence and blocks shadow pending a new hypothesis and registration.

### 15.3 GENERALIZATION and holdout

Freeze code, prompt, schema, model, tokenizer, decoder, thresholds, and seed list before opening GENERALIZATION. Open it once. No GENERALIZATION failure can be turned into new training while remaining the same evidence. For another final attempt, build a new independent product.

A sample of `100` may work as a smoke/regression test, but not as statistical proof of a low rare-event rate. The future-real holdout must be sized sufficiently for the safety rate one intends to rule out, using the table and opportunity denominators.

### 15.4 Shadow without orders

G9 runs in parallel, without mutating broker state or sending orders. Compare extractor output with human/legacy-harness decisions, with subsequent adjudication. Monitor:

- schema invalid, cap, parser exception e abstention;
- false actions and false EXITs discovered during review;
- selector broadening, literal e guard;
- drift in class, source, length, and position;
- latência, VRAM, fila e timeouts;
- incidents and contract divergences;
- any private content in logs.

Shadow may be called “future-real” only with a ledger excluding TRAIN/DEV/GENERALIZATION and a collection date. Do not use its results adaptively without invalidating its final-evidence purpose.

### 15.5 Canary and rollback

Canary is not an automatic consequence of shadow. It requires a later explicit decision, risk review, kill switch, idempotency, and harness limits. The LLM receives no execution authorization. Rollback must select the last private configuration approved by the harness and disable the candidate; it must not depend on a second model or repair. Preregistered rollback criteria include any confirmed false action, false EXIT, broadening, schema failure, material drift, p95/VRAM outside budget, or privacy incident.

## 16. Anti-pattern blacklist

1. **Tune the current 0.8B immediately:** blocked; data and labels are not yet closed.
2. **Claim that schema-valid 100/100 means perfect semantics:** false.
3. **Usar Task96 smoke como accuracy:** falso.
4. **Diagnose prompt-token loss without testing the mask:** false; the runner already uses completion-only loss.
5. **Open GENERALIZATION to choose a config:** prohibited.
6. **Train on DEVELOPMENT wording or a prior prediction:** leakage.
7. **Create synthetic data with the same TRAIN generator and call it an independent holdout:** invalid.
8. **Use disjoint hashes as proof of linguistic independence:** insufficient.
9. **Increase rank to fill an empty real cell:** no causal basis.
10. **Declare 0.8B the cause before G4/G5:** unsupported.
11. **Use lower loss as a quality measure:** contradicted by local evidence.
12. **Use a random row split instead of thread/time/source split:** likely leakage.
13. **Fill defaults, invent a side/instrument, normalize a typo, or broaden a selector:** violates the contract.
14. **Post-process partial JSON, extract a substring, or repair the parser:** invalidates the gate.
15. **Retry or make a second call to obtain JSON:** violates the one-call contract.
16. **Send state, risk, account, quantity, or broker symbol for the model to decide:** wrong architecture.
17. **Allow parent/root to trigger an action:** violates current-message-only.
18. **Call universal `NO_ACTION` safe:** operational omission is also a failure.
19. **Use a teacher as truth without adjudication:** potentially incorrect label.
20. **Run DPO/RL before semantically competent SFT:** premature.
21. **Use vendor VRAM claims as a local benchmark:** unverified.
22. **Count all tokens from correlated rows as independent n:** misleading interval.
23. **Publish messages, symbols, IDs, predictions, adapters, or private paths:** prohibited.
24. **Mutate the schema to turn a prediction into a correct answer:** prohibited.
25. **Run a canary merely because a benchmark scored 100/100:** insufficient.

## 17. Ordered immediate checklist

### G0 — today

- [ ] Mark Task97 as failed; preserve the aggregate receipt.
- [ ] Do not promote, execute, or open GENERALIZATION.
- [ ] Separate the semantic gate from the Task96 runtime smoke test.
- [ ] Confirm that the completion-only mask and one generation per row remain in the runner.

### G1 — private audit

- [ ] Generate coverage by operation, guard, composition, position, and grounding.
- [ ] Review the historical contract, ambiguous rows, and current/parent/root mixes.
- [ ] Double-annotate and adjudicate critical cells and historical failures.
- [ ] Create a ledger for near duplicates, edits, threads, and leakage.

### G2 — independence

- [ ] Group by thread/episode.
- [ ] Separate time, source, channel, and editorial family.
- [ ] Prove distinct generators and catalogs for TRAIN/DEV/GENERALIZATION.
- [ ] Select and freeze future-real data before inspecting labels.

### G3 — data

- [ ] Add real critical cells, including board, guarded, EXIT, and multi-action examples.
- [ ] Create real matched negatives when possible.
- [ ] Tag each synthetic example and conduct human audits for impactful cases.
- [ ] Freeze the serializer, prompt, schema, and lineage.
- [ ] Calibrate balanced mixture versus production prior as separate hypotheses.

### G4 — ceiling

- [ ] Measure the human/teacher ceiling on an adjudicated offline suite.
- [ ] Resolve or quarantine disagreements.
- [ ] Define safety and coverage targets before training.

### G5–G7 — model

- [ ] Retrain the 0.8B once under the clean contract.
- [ ] If semantic failure persists with clean data, locally benchmark ~4B.
- [ ] Only then consider ~8B.
- [ ] Use QLoRA only as a feasibility treatment; measure quality separately.
- [ ] Keep prompt/schema/decoder/splits identical across tiers.

### G8–G9 — evidence and operation

- [ ] Replicate the selected configuration in a new workspace.
- [ ] Freeze and open GENERALIZATION exactly once.
- [ ] Evaluate the real holdout with adequate n and slices.
- [ ] Run future-real shadow without orders.
- [ ] Review monitoring, kill switch, and rollback.
- [ ] Obtain explicit authorization before any canary; this document grants no such authorization.

## 18. Stop rules

Stop and mark `BLOCKED_NEEDS_USER_DECISION` when:

- the preregistered family exhausts its budget without Pareto improvement;
- two runs regress without a new supported hypothesis;
- continuation requires changing the schema, label meaning, current-message boundary, or harness ownership;
- there is no non-overlapping future-real pool;
- there is a safety failure, even with a valid schema;
- there is truncation, a cap hit, a non-equivalent decoder, or non-accepting EOS;
- replication does not reproduce the result;
- evaluation requires adaptively opening the sealed set or GENERALIZATION;
- credentials, deployment, destructive execution, or external API mutation are required.

Stop rules also apply affirmatively: do not keep seeking average gains when critical gates have already failed; do not turn a failure found on the same benchmark into training data and then present it as independent validation.

## 19. Definition of Done

Work is complete for a production decision only when all items are true:

- [ ] Task97 remains rejected, and the cause has not been overstated beyond the evidence.
- [ ] Real coverage, labels, and ambiguity have been audited and adjudicated.
- [ ] Thread, time, source, and generator independence have been proven by a ledger.
- [ ] Canonical TRAIN is real-heavy; synthetics are tagged, filtered, and never treated as proof.
- [ ] Real critical cells are not empty for the claim being made.
- [ ] DEVELOPMENT is explicitly adaptive.
- [ ] GENERALIZATION stays closed until the final configuration and is opened at most once per candidate.
- [ ] A future-real holdout exists that is source/thread/time-disjoint, with adequate sample size and denominators.
- [ ] The human/teacher ceiling has been measured with adjudication.
- [ ] SFT completion-only, chat template/EOS, and zero truncation have been tested.
- [ ] One `generate` call per input and a single final JSON object have been demonstrated.
- [ ] The original Draft 2020-12 schema is immutable, and final validation uses it.
- [ ] XGrammar/decoder passed differential probes; there is no repair, retry, or second call.
- [ ] Operational exact match is authoritative; components and slices are reported with n.
- [ ] False-action, false-EXIT, and broadened selectors have specific gates and zero observed cases on the required product.
- [ ] Binomial bounds, IID assumptions, and correlation are documented.
- [ ] The configuration has been replicated in an independent workspace.
- [ ] Latency, VRAM, OOM, cap, and logs have been measured locally.
- [ ] Future-real shadow completed without any order.
- [ ] The harness remains the owner of identity, state, risk, quantity, account, symbol, leverage, idempotency, and execution.
- [ ] Rollback and kill switch have been rehearsed.
- [ ] No messages, predictions, symbols, IDs, private labels, adapters, or secrets appear in public materials.
- [ ] Separate authorization was obtained for any canary; without it, there is no deployment.

## 20. One-page operating protocol

**Objective:** semantically extract a private message once into final JSON, without delegating execution to the model.

**Before training:** freeze the original schema, serializer, prompt, chat template, tokenizer, and decoder; group threads; separate by time/source; audit labels; build the critical real-data matrix; freeze DEVELOPMENT and GENERALIZATION; reserve future-real shadow.

**Training:** SFT prompt-completion, loss only on the completion, exact EOS, zero truncation, LoRA for experimental speed, one variable per family, at most three runs per family, receipt and hashes. Do not use loss as a score.

**Data:** real data takes priority; synthetic data is only a tagged supplement; use matched negatives, human counterfactuals, and hard negatives; do not use DEVELOPMENT/predictions; calibrate balancing without assuming an optimal proportion.

**Runtime:** one `generate` call; `do_sample=False`; XGrammar only as a structural constraint; EOS only in an accepting state; strict parsing; original Draft 2020-12 schema; reject cap hits, duplicates, extra text, and any incomplete JSON; no parser repair, substring extraction, defaults, retry, or second call.

**Metrics:** full operational exact is authoritative. Report schema, event, action PRF, false-action, false-EXIT, broadened selector, literal, guard, ordering, grounding, abstention, slices by role/mode/polarity/source/length/position, and p50/p95/VRAM. Always include numerator, denominator, and interval.

**Decision:** if coverage/label/independence fails, return to G1–G4. Test 0.8B only afterward; if a capacity ceiling remains, test ~4B and then ~8B under an identical contract. Replicate before GENERALIZATION. Open GENERALIZATION once; then run future-real shadow without orders. Canary only after explicit authorization.

**Safe output:** a failure means rejection/abstention, never an invented order. The harness validates state, risk, and execution. This protocol does not authorize GENERALIZATION, deployment, broker execution, or Google API mutation.

## 21. Sources and references

The web sources below were accessed on 2026-07-22 during the research. Access date differs from publication/content date. Quality and scope indicate evidential weight; vendor claims and cross-task extrapolations were qualified in the text.

| [n] | Direct source | Type and content/publication date | Access and quality |
|---:|---|---|---|
| [1] | [OpenAI — Fine-tuning / Model optimization](https://platform.openai.com/docs/guides/fine-tuning) | official documentation; content consulted 2026-07-22 | accessed via Jina Reader on 2026-07-22; strong for SFT/evaluation loop, not for sufficiency of this dataset |
| [2] | [Hugging Face TRL — SFT Trainer](https://huggingface.co/docs/trl/sft_trainer) | official documentation; consulted version with content dated 2025-09-10 | Jina Reader, 2026-07-22; strong for prompt-completion, masks, and EOS; depends on version/runtime |
| [3] | [Hugging Face PEFT — LoRA reference](https://huggingface.co/docs/peft/main/en/package_reference/lora) | official documentation; no content date provided | Jina Reader, 2026-07-22; methodological support, not an accuracy guarantee |
| [4] | [LoRA: Low-Rank Adaptation of Large Language Models](https://arxiv.org/abs/2106.09685) | research paper; submitted 2021-06-17, cited version 2021-10-16 | metadata/abstract accessed 2026-07-22; primary evidence, but tasks differ from this extractor |
| [5] | [QLoRA: Efficient Finetuning of Quantized LLMs](https://arxiv.org/abs/2305.14314) | research paper; 2023-05-24 | metadata/abstract accessed 2026-07-22; strong for studied feasibility, does not assume a quality gain |
| [6] | [NIST AI Risk Management Framework 1.0](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf) | official framework; 2023-01 | PDF accessed 2026-07-22; strong for representativeness, risk, monitoring, and intervention |
| [7] | [NIST Statistical Handbook — Exact confidence limits](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm) | official statistical handbook; no date provided | page accessed 2026-07-22; strong for exact binomial method |
| [8] | [Datasheets for Datasets](https://arxiv.org/abs/1803.09010) | research paper; version/publication consulted 2021-12-01 | page/abstract accessed 2026-07-22; strong for documentation, does not validate project labels |
| [9] | [JSON Schema Draft 2020-12 Core](https://json-schema.org/draft/2020-12/json-schema-core) | specification; 2022-06 | content accessed 2026-07-22; normative authority for the data model, not external truth |
| [10] | [Hugging Face Transformers — generation utilities](https://huggingface.co/docs/transformers/main/en/internal/generation_utils) | official documentation; no date provided | accessed 2026-07-22; strong for documented logits-processor integration |
| [11] | [Official XGrammar README](https://raw.githubusercontent.com/mlc-ai/xgrammar/main/README.md) | official repository README; no date provided | accessed 2026-07-22; project claim, limited to structure |
| [12] | [Self-Instruct: Aligning Language Models with Self-Generated Instructions](https://arxiv.org/abs/2212.10560) | preprint/ACL paper; 2022-12-20 | abstract accessed 2026-07-22; useful evidence, but not trading-specific |
| [13] | [Training language models to follow instructions with human feedback](https://arxiv.org/abs/2203.02155) | research paper; 2022-03-07 | abstract accessed 2026-07-22; cross-task, used with moderate confidence |
| [14] | [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172) | TACL/paper; submitted 2023-07-06, content consulted 2023-11-22 | abstract accessed 2026-07-22; strong as a positional warning, not a law for this model |
| [15] | [Selective Classification for Deep Neural Networks](https://arxiv.org/abs/1705.08500) | preprint; 2017-05-23 | abstract accessed 2026-07-22; reject-option method, not a ready-made threshold |
| [16] | [DeepXplore: Automated Whitebox Testing of Deep Learning Systems](https://arxiv.org/abs/1705.06640) | SOSP paper/preprint; 2017-05-18 | abstract accessed 2026-07-22; inspiration for offline coverage/differential testing |
| [17] | [Learning the Difference that Makes a Difference with Counterfactually-Augmented Data](https://arxiv.org/abs/1909.12434) | ICLR paper; 2019-09-26 | abstract accessed 2026-07-22; supports minimal human edits, different task |
| [18] | [Qwen3-0.6B model card](https://huggingface.co/Qwen/Qwen3-0.6B) | official Qwen card; 2025 | accessed 2026-07-22; refers to Qwen3-0.6B, not the exact Qwen3.5-0.8B checkpoint |
| [19] | [Unsloth — Qwen3 fine-tuning](https://docs.unsloth.ai/basics/qwen3-how-to-run-and-fine-tune) | vendor documentation; no date provided | accessed 2026-07-22; low confidence for VRAM/speed claims, requires local benchmark |
| [20] | [Direct Preference Optimization](https://arxiv.org/abs/2305.18290) | preprint; 2023-05-29 | abstract accessed 2026-07-22; supports the preference-loss concept, not this product |
| [21] | [Google ML Crash Course — Overfitting](https://developers.google.com/machine-learning/crash-course/overfitting/overfitting) | educational documentation; content dated 2025-12-03 | accessed 2026-07-22; supports independence/generalization, not project validation |

**Relevant retrieval failures:** attempted sources on imbalance, reproducibility, metamorphic testing, weak-to-strong distillation, and some model/infrastructure pages returned HTTP 429 or 404. No claim dependent on them was presented as fact. Published literature supports components of the method; it does not specify the optimal mixture, learning rate, size, or sufficient capacity for this extractor.

## Appendix A — Local project evidence

This appendix separates project evidence from published literature. The paths are aggregated repository artifacts; no private message, prediction, symbol, ID, adapter, or secret is reproduced.

### A.1 Task97 and Task96

| Evidence | Exact path | Aggregate reading | Manifest SHA256 |
|---|---|---|---|
| Task97 fresh model run | `.pi/build/broker_semantic_v62_task_97_checkpoint/completion_manifest.json` | fresh Qwen3.5-0.8B; BF16 LoRA; XGrammar; semantic metrics failed | `078d6b4a7996492b166bd89e829c22930e1d8a059e1ad7e0882df02c76ad9f52` |
| Task96 runtime smoke | `.pi/build/broker_semantic_v62_task_96_checkpoint/completion_manifest.json` | no model/training/predictions; runtime smoke `100/100`, bases `5/5`, invalid `11/11` | `9fad1b16e943774389efb9ef76379cd096cb97b5d03a25c8c0ae840e95d2222a` |

The Task97 manifest records `gate_passed=false`, `invalid_count=0`, `cap_hit_count=0`, `completed_updates=3537`, `loss_count=3537`, and the metric vector used in section 2. The Task96 manifest records zero updates/losses/prediction rows and `no_model_training_generation=true`. These are execution aggregates, not output examples.

### A.2 Coverage and generalization

- `.pi/build/broker_semantic_v62_task_97_checkpoint/completion_manifest.json`
- `.pi/build/broker_semantic_v62_task_96_checkpoint/completion_manifest.json`
- `docs/broker_semantic_research/V58_DATASET_COVERAGE_MATRIX.md`
- `docs/broker_semantic_v61/GENERALIZATION_ANALYSIS_AND_ACTION_PLAN.md`
- `docs/broker_semantic_research/QWEN08B_E1_PRODUCTION_PROTOCOL.md`
- `runtime/datasets/broker_semantic_v62/freeze/manifest.json`
- `runtime/datasets/broker_semantic_v62/candidates/H0_CAL/manifest.json`

The freeze manifest marks DEVELOPMENT as `DEVELOPMENT_ONLY` and GENERALIZATION as `FREEZE_ONLY`; candidate H0_CAL lists GENERALIZATION with zero rows in the candidate product. This supports the claim that the candidate did not open GENERALIZATION; it does not support any performance claim on it.

### A.3 Runner and reproducibility limits

- `src/auto_trader/local_lora/train_unsloth_qwen35_08b_v62.py`

The relevant path verifies the chat template and EOS, measures token readiness without truncation, creates `-100` labels for the prompt and active labels for the completion, trains with the audited run’s fixed batch/accumulation, and calls `model.generate` once for each row. The decoder is applied as a `LogitsProcessor`; the complete output is validated by the project evaluator. The existence of this path does not prove universal CUDA determinism: local documentation records determinism controls that may not all be enabled. Replication is therefore a gate.

### A.4 Earlier local evidence used as context, not as an adaptive target

- `docs/broker_semantic_research/V58_DATASET_COVERAGE_MATRIX.md`
- `docs/broker_semantic_v61/GENERALIZATION_ANALYSIS_AND_ACTION_PLAN.md`
- `docs/broker_semantic_research/QWEN08B_E1_PRODUCTION_PROTOCOL.md`

V58 explicitly states that its counts are investigative, not proof of sufficiency. The v6.1 analysis records that DEVELOPMENT was adaptive, that variants from the same generator do not demonstrate linguistic independence, and that shadow was `BLOCKED_NO_PROVEN_CLEAN_POOL`. The Qwen08B protocol records gates for no truncation, zero safety errors, replication, shadow, and an explicitly closed sealed set. This guide preserves those limitations.

## Appendix: Methodology

Five Phase 1 YAML artifacts were reconciled, covering fine-tuning foundations, evaluation science, structured output, data/model strategy, and experimental methods, along with the manifests and local documents listed in Appendix A. Web research was conducted on 2026-07-22. Published facts were kept within the source’s scope; vendor results were qualified; cross-task extrapolations were marked INFERENCE. No new private-data research or inspection of messages or predictions was performed.

Overall confidence in this guide is **Medium-High for the immediate verdict and Medium for the optimal recipe**. The immediate verdict is supported by converging Task97 manifest, coverage audit, protocol, and runtime evidence: the candidate failed semantically and cannot be deployed. The optimal recipe remains unknown because complete adjudication, denominators by slice, an independent future-real pool, and a causal comparison after the gates are missing. Consequently, no number of rows, synthetic proportion, learning rate, rank, epoch count, or new model size is presented as a guarantee.

The decision methodology is conservative:

1. separate fact from inference and unknown;
2. reconcile every claim with its source, date, independence, confidence, and caveat;
3. treat operational exact match as authoritative;
4. keep schema and harness contracts immutable;
5. require source/thread/time independence;
6. use binomial intervals and denominators by slice;
7. change one variable per family;
8. replicate before any final opening;
9. test shadow without orders;
10. stop when the evidence does not authorize the next step.

This document is a research production guide. It does not authorize opening GENERALIZATION, deployment, broker execution, canary, or Google API mutations.
