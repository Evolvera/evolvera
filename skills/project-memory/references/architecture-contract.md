# Architecture Memory Contract — schemaVersion 1

`architecture.json` is the editable, normalized source of truth. `architecture.html` is a generated view: never hand-edit it. Run the validator before rendering.

```sh
node skills/project-memory/scripts/validate-architecture.mjs .pi/memory/architecture.json
node skills/project-memory/scripts/render-architecture.mjs .pi/memory/architecture.json
```

## Design rules

- Every record and flow step has one globally unique, stable, kebab-case `id`. Rename an ID only when the represented concept changes identity.
- Reference IDs instead of embedding copies. Actor, component, and data-object IDs share the relationship endpoint namespace.
- Record only repository-grounded facts. `known` and `inferred` records require `evidenceIds`; use `unknown` when evidence does not exist yet.
- `sourceHead` is a lowercase 40-hex Git commit or the literal `UNKNOWN`.
- Timestamps are ISO UTC timestamps. Rendering never changes timestamps or source JSON.
- Repository evidence paths are relative, cannot traverse with `..`, and cannot be URLs or absolute paths.
- Component hierarchy is deliberate semantic zoom, not filesystem depth: a child is exactly one level deeper than its parent, with levels limited to 0–3.

## Top-level shape

All top-level keys are required.

| Key | Contract |
| --- | --- |
| `schemaVersion` | Integer `1`. |
| `project` | `{ id, name, description?, repository? }`. |
| `snapshot` | `{ sourceHead, generatedAt, lastVerifiedAt, scope, confidence }`. |
| `actors` | People, roles, or systems that initiate or receive behavior. |
| `components` | Normalized architecture surfaces arranged into a semantic hierarchy. |
| `dataObjects` | Named data, records, documents, messages, or contracts. |
| `relationships` | Directed links between actor/component/data IDs. |
| `flows` | Ordered user, data, runtime, build, deploy, or failure narratives. |
| `evidence` | Repository locations and factual claims. |
| `gaps` | Explicit open, resolved, or accepted architecture questions. |

`confidence` is always `known`, `inferred`, or `unknown`.

## Records

### Actor

Required: `id`, `name`, `kind`, `confidence`, `evidenceIds`. Optional: `description`.

### Component

Required: `id`, `name`, `kind`, `level`, `confidence`, `evidenceIds`. Optional: `description`, `parentId`.

Kinds: `actor-facing`, `client`, `domain`, `service`, `worker`, `datastore`, `queue`, `external`, `build`, `deploy`, `library`.

Semantic levels:

- **L0 — landscape:** products/domains and external boundaries.
- **L1 — systems:** applications, services, workers, datastores, pipelines.
- **L2 — modules:** bounded contexts, modules, entrypoints, contracts.
- **L3 — internals:** endpoints, events, data objects, and flow steps.

A root component has no `parentId` and normally uses level 0. A child level must equal its parent level plus one. Level 3 is the maximum.

### Data object

Required: `id`, `name`, `kind`, `ownerIds`, `confidence`, `evidenceIds`. Optional: `description`. `ownerIds` reference components.

### Relationship

Required: `id`, `name`, `kind`, `fromId`, `toId`, `dataObjectIds`, `evidenceIds`, `confidence`. Optional: `description`, `protocol`.

Kinds: `uses`, `calls`, `reads`, `writes`, `publishes`, `subscribes`, `contains`, `depends-on`, `builds`, `deploys`, `observes`, `authenticates`.

Endpoints reference actors, components, or data objects. `dataObjectIds` reference normalized data objects.

### Flow

Required: `id`, `name`, `type`, `actorIds`, `entrypointIds`, `steps`, `outcomes`, `failureModes`, `evidenceIds`, `confidence`. Optional: `description`.

Types: `user`, `data`, `runtime`, `build`, `deploy`, `failure`.

Steps are ordered objects with required `id`, positive contiguous `order`, `action`, `componentIds`, `relationshipIds`, and `dataObjectIds`. Optional step fields are `input`, `output`, and `stateChange`. Outcomes and failure modes are concise strings; repeated entities remain references.

### Evidence

Required: `id`, repository-relative `path`, and factual `claim`. Optional: `symbol`, positive `startLine`, `endLine` (not before start), and `sourceHead`.

Evidence appears in the viewer detail panel instead of becoming graph labels.

### Gap

Required: `id`, `title`, `status`, `impact`, `question`, `evidenceIds`. Status is `open`, `resolved`, or `accepted`. Keep unanswered initial-scan work explicit rather than filling it with guesses.

## Generation and safety

The renderer validates before writing. It places one safely escaped JSON payload in one `<script type="application/json">` element and includes no external assets, fonts, packages, or runtime. Literal `</script>` sequences are escaped so source text cannot terminate the data element. The resulting viewer uses deterministic hierarchy layout and progressive disclosure; it does not replace the normalized JSON as input for agents.
