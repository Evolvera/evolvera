---
name: prompt-engineering
description: Evidence- and evaluation-driven prompt engineering for production LLM systems. Use to create, audit, optimize, migrate, or debug system/developer/user prompts, agent instructions, tool descriptions, RAG/context assembly, structured outputs, and multimodal prompt contracts. Before authoring, identify the exact model maker, provider/host, model/version/API and features, then consult the current first-party guide from the model maker and host; never assume one model's prompting guidance applies to another.
---

# Prompt Engineering — Model-Specific, Evidence-Driven Workflow

Use this skill to engineer prompts as versioned production interfaces rather than isolated prose or collections of “magic phrases.”

Match depth to consequence. A one-off low-risk rewrite may need a small model check and focused examples; an agent prompt with tools, private context, or consequential actions requires the full identity, evaluation, and security gates.

## Canonical Reference

Read the bundled guide relative to this `SKILL.md`:

```text
references/PROMPT_ENGINEERING_PRODUCTION_GUIDE.md
```

Reference snapshot:

- title: `Engenharia de prompts em produção: Relatório de Pesquisa Profunda`;
- research cutoff: `2026-07-18`;
- SHA-256: `1971fb6867658d12ce9472f258821cc304667f86d89f813bbcfe23f208786877`;
- evidence: first-party provider documentation, OWASP/NIST, primary prompting papers, five independent research lines, focused security validation, and two audit passes;
- confidence ceiling: Medium because methods remain model/task/version dependent and no concrete runtime is certified by the guide.

For any material prompt task, read at least the guide's Executive Summary, identity gate, provider map, relevant method section, evaluation section, security/risk section, operating protocol, and source limitations.

The guide is a dated evidence snapshot, not current model documentation. Runtime evidence and current first-party documentation always outrank it.

## Activation Boundary

Use this skill for:

- system, developer, user, agent, evaluator, and grader prompts;
- prompt templates, variables, examples, policies, and context assembly;
- tool/function descriptions and tool-selection instructions;
- structured-output and schema-oriented prompting;
- RAG, long-context, multimodal, and agent-loop prompts;
- prompt debugging, optimization, migration, versioning, and rollback;
- prompt evaluation suites, graders, adversarial cases, and release gates.

Do not use prompt editing as a default fix when the failure belongs to data quality, retrieval, tool implementation, permissions, model capacity, latency/cost, schema support, or fine-tuning. Use the `llm-finetuning` skill when the approved decision is to train or adapt model weights.

This skill never authorizes provider spend, private-data upload, production rollout, privileged tool execution, destructive action, or deployment. Those boundaries require explicit authorization.

## Non-Negotiable Model Identity Gate

**Do not author model-specific prompt advice until the actual runtime is identified from evidence.** User wording and model aliases are leads, not proof.

Inspect code, configuration, model registry, deployment manifests, API responses, SDK initialization, agent frontmatter, serving stack, tokenizer, and model card as applicable. Record:

```yaml
prompt_runtime:
  model_maker: UNKNOWN
  api_provider_or_host: UNKNOWN
  endpoint: UNKNOWN
  api_mode: UNKNOWN
  requested_model_id: UNKNOWN
  resolved_model_id_snapshot_version: UNKNOWN
  base_model_if_custom_or_finetuned: UNKNOWN
  sdk_name_version: UNKNOWN
  api_version: UNKNOWN
  serving_framework_version: UNKNOWN
  region: UNKNOWN
  modality: UNKNOWN
  instruction_roles_and_precedence: UNKNOWN
  reasoning_or_thinking_controls: UNKNOWN
  tools_or_function_calling: UNKNOWN
  structured_output_or_schema_support: UNKNOWN
  context_window_and_caching: UNKNOWN
  supported_decoding_parameters: []
  official_evidence_urls: []
  resolved_at: UNKNOWN
```

Distinguish:

- **model maker** from **API host/provider** — for example, a model maker's model served through Azure, Bedrock, Vertex, OpenRouter, or another gateway;
- requested alias from actually resolved snapshot/version;
- hosted API behavior from self-hosted checkpoint behavior;
- base-model guidance from custom/fine-tuned model behavior;
- model capability from SDK or endpoint capability.

For a hosted third-party model, consult both the maker's prompt/model guidance and the host/API documentation. For self-hosted weights, inspect the exact model card, tokenizer `chat_template`, serving framework, generation configuration, and any official release notes.

If routing can select multiple models, either:

1. maintain and evaluate prompt variants per model/runtime; or
2. use a deliberately portable common subset and test every routed target.

Never pretend a single prompt is validated across dynamic routes without per-route evidence.

If a correctness-critical field remains `UNKNOWN`, stop model-specific prompt design. Ask for the missing deployment decision only when repository/runtime evidence cannot resolve it.

## Mandatory Current First-Party Research

After identifying the runtime, research the current official guidance **at the time of the task**.

### Source priority

1. exact model/version prompt guide or model card from the maker;
2. exact endpoint/API/SDK documentation from the host;
3. model-specific system card, release notes, migration guide, and changelog;
4. official cookbook/examples or official organization repository;
5. provider-general prompt guide;
6. primary research for candidate methods;
7. third-party material only for discovery or explicitly bounded comparison.

Use available search/retrieval tools. `jina_read` reads a known official URL; it is not broad search. If no web discovery tool is configured and the current official URL cannot be grounded from repository evidence, existing official links, or provider navigation, report the discovery gap instead of inventing a URL.

Use the provider map in the canonical guide only as discovery seeds. Documentation moves; 404/403/429 means unavailable or moved, not nonexistent.

### Required research record

Capture direct, inspectable evidence:

```yaml
model_prompt_research:
  runtime_identity: "<reference to completed identity gate>"
  researched_at: "<ISO date/time>"
  sources:
    - url: "<direct official URL>"
      owner: "<model maker or host>"
      title: "<literal title>"
      publication_or_version_date: UNKNOWN
      access_date: "<date>"
      exact_applicability: "<model/version/API/features>"
      literal_excerpt: "<supporting text>"
      guidance_used: "<bounded decision>"
      caveat: "<scope, conflict, or uncertainty>"
  conflicts: []
  unresolved: []
```

Do not use a nearby citation that fails to support the claim. Repeated citations to the same page are one source, not independent corroboration.

When guidance conflicts:

- exact model/version outranks family-wide guidance;
- maker guidance governs model behavior; host docs govern transport/API features;
- current API behavior and explicit errors outrank cached memory;
- preserve unresolved disagreement and test both candidates when consequential.

If official guidance is unavailable, use `UNKNOWN`, start from a conservative portable baseline, and state that vendor-specific controls remain unverified.

## Diagnose the Correct Lever Before Editing

Classify the observed failure:

| Failure source | Typical evidence | Appropriate lever |
|---|---|---|
| Prompt contract | ambiguous instruction, missing edge policy, bad example | focused prompt change |
| Model capability | clean task contract fails consistently on target slices | model comparison or fine-tuning investigation |
| Retrieval/context | missing, stale, noisy, incorrectly ordered evidence | retrieval/context pipeline |
| Tool/API | bad schema, description, permissions, implementation, state | tool/runtime change |
| Output enforcement | malformed or schema-invalid responses | native structured output/schema/runtime validation |
| Product policy | unclear authorization, business meaning, refusal behavior | user/product decision, not prompt invention |
| Cost/latency | prompt too large, repeated context, expensive method | model/context/architecture optimization |
| Security | injection, exfiltration, excessive tool privilege | trust boundary and runtime controls, not prose alone |

Prompt engineering is not always the right fix. Do not add instructions to compensate for unavailable data, unauthorized behavior, broken tools, or missing deterministic validation.

## Prompt Contract

Start with the smallest contract that makes success and failure observable. Add structure only when the target model's guide or evaluation justifies it.

### 1. Authority and role

Place durable instructions in the highest supported application-controlled authority level. Use only roles and precedence documented for the exact API. A `developer`, `system`, prefill, or assistant-message pattern from one provider may be invalid or have different authority elsewhere.

Define a bounded function, not a theatrical persona. Persona is useful only when it supplies concrete domain behavior, audience, style, or decision boundaries that pass evaluation.

### 2. Task and success

State:

- input type and trusted source;
- exact decision or transformation;
- consumer of the result;
- observable success criteria;
- what evidence may be used;
- behavior when evidence is missing, conflicting, unsafe, or outside scope;
- completion and stop conditions.

Prefer verifiable imperatives over vague adjectives such as “smart,” “careful,” or “perfect.”

### 3. Constraints and priorities

Express rules that can be tested. Separate:

- required behavior;
- prohibited behavior;
- priority when rules conflict;
- uncertainty/refusal/escalation policy;
- privacy and citation requirements;
- action authorization boundary.

Do not duplicate the same rule many times unless an evaluated model-specific guide requires reinforcement. Contradictory repetition increases ambiguity.

### 4. Context and trust labels

Keep instructions separate from data. Mark provenance, timestamp, relevance, and trust level. User text, retrieved documents, web pages, files, images, tool results, and examples may contain adversarial instructions.

Use delimiters documented or successfully evaluated for the target model—XML tags, Markdown headings, JSON fields, or typed message parts are candidates, not universal winners.

For long context:

- include only decision-relevant material;
- preserve source and section boundaries;
- test relevant evidence at beginning, middle, and end;
- test truncation and context-window behavior;
- prefer retrieval/selection over blind context stuffing;
- follow the exact model guide for document/question ordering.

### 5. Examples

Start zero-shot as a clean baseline unless the exact guide or existing evidence requires examples.

Use few-shot examples when they resolve output shape, ambiguous labels, rare boundaries, or interaction patterns. Examples must be:

- correct and reviewed;
- diverse across meaningful slices;
- representative of production;
- separated from untrusted runtime context;
- free from secrets and test leakage;
- measured for token, latency, and security cost.

Do not assume more examples are always better. Test ordering and many-shot prompt-injection risk.

### 6. Reasoning, thinking, and decomposition

Never universally add “think step by step” or request hidden chain-of-thought.

First verify the exact model's reasoning controls and disclosure policy. Depending on model/API, the correct choice may be:

- concise direct instruction;
- high-level goal with built-in/internal reasoning;
- explicit decomposition into verifiable suboutputs;
- tool-assisted plan/act/observe loop;
- multiple sampled answers with deterministic adjudication;
- no reasoning trace in the user-visible response.

Use explicit CoT, self-consistency, least-to-most, or decomposition only as evaluated candidates. Measure quality, latency, cost, leakage, and whether rationale plausibility diverges from answer correctness.

Prefer verifiable intermediate artifacts—calculations, citations, tool observations, typed plan steps—over demands for private/internal reasoning.

### 7. Tools and actions

Treat tool descriptions as prompts and APIs:

- one clear responsibility per tool;
- exact argument meaning, units, enums, defaults, and constraints;
- preconditions and when not to call;
- expected result and error states;
- no overlapping tools without a selection rule;
- minimal permissions;
- deterministic validation before execution;
- explicit approval for consequential or irreversible effects;
- idempotency and rollback where applicable.

Separate three contracts:

1. instruction prose;
2. tool/action schema;
3. final response schema.

The model may propose an action; trusted code authorizes and executes it.

### 8. Output contract

When the exact model/API supports native structured outputs or constrained decoding, prefer that enforceable contract over prose-only formatting. Verify supported schema features and failure modes.

Validate separately:

- completion/truncation/refusal/filter state;
- strict parse and schema adherence;
- semantic correctness and grounding;
- business authorization and safety;
- tool effects.

Valid JSON or schema adherence is not factuality, completeness, authorization, or security.

### 9. Failure behavior

Define distinct handling for:

- insufficient evidence;
- ambiguity needing user input;
- unsupported request;
- safety refusal;
- context overflow or truncation;
- malformed/schema-invalid output;
- invalid tool call;
- tool failure/timeout;
- stale or conflicting retrieved data.

Do not use blind retry or repair to convert a refusal, authorization failure, or missing evidence into an apparently successful answer.

## Method Selection Gates

Methods are candidates, never defaults independent of model/task/version.

| Method | Consider when | Avoid or stop when | Required oracle |
|---|---|---|---|
| Zero-shot | task is simple and contract is clear | failures show unresolved ambiguity | clean baseline quality/cost/latency |
| Few-shot | examples clarify labels, format, or rare cases | examples are wrong, leaking, expensive, or attackable | held-out gain by slice plus many-shot test |
| Explicit CoT | model supports it and task requires complex verifiable reasoning | reasoning is internal, sensitive, misleading, or costly | answer correctness plus leakage/cost |
| Decomposition | errors arise from multi-step scope or composition | decomposition amplifies mistakes or state drift | end-to-end and step-level checks |
| Self-consistency | multiple paths can converge on a checkable answer | cost/latency unacceptable or shared bias dominates | accuracy/variance/cost comparison |
| ReAct/tool loop | fresh facts/actions/observations are required | static answer suffices or tools lack controls | tool selection, arguments, observations, final result |
| Interleaved retrieval | later queries depend on prior findings | task is single-hop or retrieval noise grows | retrieval and downstream outcome |
| Long context | necessary evidence cannot be reduced safely | middle-position/truncation failures or cost dominate | position and length slices |
| Structured outputs | downstream code needs typed data and API supports it | unsupported schema or semantics remain weak | schema plus semantic/business validation |
| APE/APO/DSPy-like optimization | repeatable task, reliable metric, sufficient data/budget | optimizer overfits or metric misses harms | untouched held-out, slices, cost, security |

## Evaluation-First Optimization Loop

Treat the deployable unit as:

```text
maker + host/API + resolved model/version + SDK/API
+ tools/schemas + retrieval/context + decoding
+ prompt version
```

### 1. Define evaluation before optimization

Create representative and adversarial cases with expected behavior. Separate:

- development cases used to diagnose and create variants;
- held-out cases never used to author or select prompt wording;
- production shadow/canary evidence where authorized.

Define authority metrics and critical failure slices. Open-ended “looks better” review is insufficient.

### 2. Freeze comparison boundaries

For a causal prompt comparison, keep model snapshot, API, tools, corpus, schema, decoding, budget, and grader fixed. If multiple components change, report an integrated system comparison rather than prompt causality.

### 3. Start simple

Run the smallest adequate prompt as baseline. Inspect failures before adding examples, roles, long context, reasoning, or chains.

### 4. Change one hypothesis at a time

Record the expected affected slice and falsification signal. Maintain a bounded variant budget. Automatic optimizers require the same controls and may overfit their search set.

### 5. Measure the complete outcome

As applicable, record:

- task success, exactness, groundedness, factuality, completeness;
- refusal and uncertainty behavior;
- parse/schema/tool-call validity and semantic correctness;
- false positive/negative and high-risk slices;
- prompt-injection and untrusted-context behavior;
- latency, tokens, cost, cache behavior, rate limits, and retries;
- variance across repeated stochastic runs;
- user or human-review outcomes with a documented rubric.

Use deterministic graders where possible. LLM-as-judge needs its own model identity, rubric, calibration, bias checks, and version pinning.

### 6. Promote with evidence

Promote only when held-out evidence improves the approved criteria without unacceptable regression. Store:

- prompt and semantic diff;
- runtime identity and official research record;
- eval dataset/hash and grader version;
- raw/aggregate results allowed by privacy policy;
- decision and unresolved risks;
- previous production version and rollback procedure.

Reopen evaluation when prompt, model alias/snapshot, provider/host, SDK/API, tools, schema, retrieval corpus, modality, or decoding changes.

## Security Boundary

Prompts are not a trust boundary. RAG, fine-tuning, delimiters, “ignore malicious instructions,” and more examples do not eliminate direct or indirect prompt injection.

Required external controls for consequential systems include:

- strict separation and labeling of untrusted content;
- least-privilege credentials and tool access;
- deterministic input/output/schema/business validation;
- allowlists and policy checks outside the model;
- human approval for high-risk or irreversible actions;
- sandboxing, rate/resource limits, idempotency, and rollback;
- secret minimization and output exfiltration controls;
- logs and incident response with privacy-preserving retention;
- adversarial tests for direct/indirect injection, obfuscation, multilingual input, multimodal content, many-shot attacks, tool misuse, and data exfiltration.

Do not claim security because the system prompt says not to follow malicious instructions. Report target-runtime security as `UNVERIFIED` until exercised.

## Required Artifacts

### Model and source memo

```markdown
# Model Prompt Research
Runtime: <maker / host / API / resolved model / SDK / features>
Official maker guidance: <URL + excerpt + applicability>
Official host/API guidance: <URL + excerpt + applicability>
Model/version-specific rules: <bounded list>
Conflicts and UNKNOWNs: <list>
Research date: <date>
```

### Prompt specification

```markdown
# Prompt Spec <version>
Outcome and consumer:
Runtime identity:
Authority/role contract:
Input and trust contract:
Task and constraints:
Context assembly:
Examples and provenance:
Tool/action contract:
Output/schema contract:
Failure/refusal/escalation behavior:
Security controls outside prompt:
Evaluation and release gate:
Rollback version:
```

### Experiment receipt

```markdown
# Prompt Experiment <ID>
Decision this can change:
Baseline and variant:
Single hypothesis:
Frozen runtime/system boundaries:
Development and held-out evidence:
Quality and failure slices:
Cost/latency/variance:
Security/adversarial results:
Verdict: PROMOTE | REJECT | BLOCKED | UNVERIFIED
Prompt/runtime hashes or versions:
Rollback:
```

## Output Modes

Return only the artifact needed by the request:

- **Prompt draft:** runtime research memo, prompt, assumptions, focused test cases.
- **Prompt audit:** contract violations, model-guide mismatches, failure taxonomy, minimal fixes.
- **Optimization plan:** baseline, hypotheses, eval design, variant budget, promotion/rollback gates.
- **Migration:** old/new runtime matrix, official-guide differences, prompt variants, regression plan.
- **Tool/agent prompt:** instruction hierarchy, tool schemas, permissions, state/failure contract, adversarial tests.
- **Production review:** exact versions, held-out/runtime evidence, security boundary, verdict and rollback.

Do not bury critical `UNKNOWN`, unsupported vendor guidance, or untested security behind polished prompt prose.

## Stop Rules

Stop and report the smallest blocker when:

- exact maker/provider/host/model/version/API cannot be established;
- model-specific advice is requested but current official guidance cannot be located or read;
- the prompt targets multiple dynamic models without per-model evaluation;
- success criteria or representative test cases are absent for a material optimization;
- the requested behavior requires unavailable data, tools, permissions, or product semantics;
- the change attempts to solve prompt injection or authorization using prompt text alone;
- a structured-output claim lacks exact model/API/schema support;
- reasoning controls or role syntax are copied from another provider without evidence;
- variants are selected on the same examples used to author them with no untouched evidence;
- two iterations fail without a new evidence-backed hypothesis;
- continuing requires private-data upload, spend, deployment, or external mutation without authorization;
- required runtime evidence cannot be observed—return `UNVERIFIED`, not `PASS`.

## Completion Standard

Before declaring a prompt task complete, verify proportionately:

- exact runtime identity is recorded or critical UNKNOWNs are explicit;
- current maker and host/API guidance was consulted and cited;
- prompt editing is the correct lever;
- task, context, examples, tools, output, and failure contracts are explicit where applicable;
- untrusted data is not treated as instruction authority;
- model/task-dependent methods are tested rather than assumed;
- baseline and held-out or regression evidence match the consequence;
- semantic correctness is separate from formatting/schema success;
- quality, cost, latency, variance, refusals, and critical slices are measured as applicable;
- security controls live outside prompt prose and target-runtime security is not overclaimed;
- prompt/runtime versions, evidence, decision, and rollback are recorded;
- no consequential external action is implied without authorization.
