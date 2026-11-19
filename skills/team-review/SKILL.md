---
name: team-review
description: "Orchestrator-owned, optional, focused review of a completed local diff using independent UX, simplicity, edge-case, or defensive security lenses."
---

# Team Review

Use only after the real diff exists. This is optional and not a general PR gate: default to zero reviewers. Select one lens only when one material risk warrants it. Launch multiple reviewers in the same wave only for independent, uncovered risks; a task may name either a single shared diff/base/head or separate scoped questions. Never send overlapping questions merely to seek consensus.

Use the actual Agent types: `reviewer-ux` for an affected user journey, `reviewer-simplicity` for unnecessary maintenance burden, `reviewer-edge-cases` for a boundary or unusual state, and `reviewer-security` for a changed trust boundary. Use each definition's pinned model. For a wave, issue independent `Agent` calls together with `run_in_background: true`. Bind each question to its own target, even if the reviewers inspect different tasks.

Each fresh reviewer invocation must receive the exact diff content or named diff path, base and head when available, changed artifacts, user acceptance, supplied runtime evidence, and one distinct scoped question. Keep each reviewer within its named lens. Do not require a whole-head reviewer unless an existing PR process or a concrete escape gate warrants one.

Reviewers return findings, no findings, or insufficient evidence for their lens only. A finding cites the changed file/location, evidence, concrete impact, and smallest fix. The orchestrator merges duplicate evidence; no majority vote or consensus loop. The original builder owns any repair. A lens result is not a general PR PASS and does not replace QA or required behavioral validation.
