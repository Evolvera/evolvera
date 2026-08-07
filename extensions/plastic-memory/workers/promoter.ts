import { makeQueryId, recordDigest } from "../common/ids.ts";
import { scrubSensitiveText } from "../common/safety.ts";
import { verifyCumulativeState, type CumulativeState } from "../compaction/render.ts";
import { isProjectId, validatePublicationCandidate } from "../project/schema.ts";
import { makePlasticEntry } from "../session/ledger.ts";
import {
  PLASTIC_PROJECT_PROPOSAL_RECORDED,
  isCompactionAppliedRecord,
  type CompactionAppliedData,
  type PlasticEntry,
  type ProjectProposalData,
  type SessionBinding,
  type StructuredProjectProposalData,
} from "../session/types.ts";
import { runBoundedRole, type RunnerRuntime, type RunnerResult } from "./runner.ts";

export type PromoterInput = Readonly<{
  binding: SessionBinding;
  projectId: string;
  sourceDigest: string;
  projectSnapshot: unknown;
  acknowledgement?: CompactionAppliedData;
  verifiedState?: CumulativeState;
  explicitRequest?: boolean;
  runtime: RunnerRuntime;
  signal?: AbortSignal;
}>;
export type PromoterResult = Readonly<{
  ok: boolean;
  proposalOnly: true;
  proposal?: ProjectProposalData | StructuredProjectProposalData;
  record?: PlasticEntry<"plastic.project.proposal.recorded">;
  runner?: RunnerResult;
  reason?: string;
}>;

type AutomaticSource = Readonly<{
  state: CumulativeState;
  sourceDigest: string;
  source: StructuredProjectProposalData["source"];
}>;

const PROMOTER_SYSTEM = "Propose project-memory changes only from repository evidence. Never write files or publish changes. For automatic requests, return JSON with one complete schema-valid candidate and nonempty evidence. Never return identity, binding, source, proposal, or provenance fields: deterministic harness code supplies those.";
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function clean(value: string, max: number): string { return scrubSensitiveText(value).replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, max); }
function acknowledgementIsValid(value: unknown): value is CompactionAppliedData {
  return isCompactionAppliedRecord({ type: "custom", customType: "plastic.compaction.applied", data: value });
}
function automaticSource(input: PromoterInput): AutomaticSource | undefined {
  const acknowledgement = input.acknowledgement;
  if (!acknowledgementIsValid(acknowledgement) || !isProjectId(input.projectId)
    || acknowledgement.sessionId !== input.binding.sessionId
    || (acknowledgement.generation === input.binding.generation && acknowledgement.branchId === input.binding.branchId)) return undefined;
  let state: CumulativeState;
  try { state = structuredClone(input.verifiedState); } catch { return undefined; }
  if (!verifyCumulativeState(state)) return undefined;
  const acknowledgementDigest = recordDigest(input.binding.sessionId, { kind: "plastic-compaction-acknowledgement" }, acknowledgement);
  const source = {
    kind: "plastic-compaction" as const,
    compactionEntryId: acknowledgement.compactionEntryId,
    acknowledgementDigest,
    stateDigest: state.stateDigest,
  };
  return {
    state,
    source,
    sourceDigest: recordDigest(input.binding.sessionId, {
      compactionEntryId: source.compactionEntryId,
      acknowledgementDigest: source.acknowledgementDigest,
      stateDigest: source.stateDigest,
    }, state.projectSnapshot),
  };
}
function promptFor(input: PromoterInput): string {
  if (input.explicitRequest) {
    return JSON.stringify({ binding: input.binding, projectId: input.projectId, sourceDigest: input.sourceDigest, projectSnapshot: input.projectSnapshot, output: { proposal: "proposal text", repositoryEvidence: "nonempty repository paths/facts supporting the proposal" } });
  }
  return JSON.stringify({ projectId: input.projectId, projectSnapshot: input.projectSnapshot, output: { candidate: { category: "schema category", title: "safe title", target: "safe relative target path", body: "safe proposal body", confidence: "known|inferred|unknown", evidence: [{ id: "evidence-id", path: "safe relative repository path", claim: "bounded supporting repository fact" }] } } });
}

/** Promotion is a proposal-only, evidence-gated role; it has no filesystem capability. */
export async function runPromoter(input: PromoterInput): Promise<PromoterResult> {
  if (input.explicitRequest) {
    const runner = await runBoundedRole({ role: "project-promoter", prompt: promptFor(input), systemPrompt: PROMOTER_SYSTEM, runtime: input.runtime, signal: input.signal, inputTokens: Math.ceil(JSON.stringify(input.projectSnapshot).length / 4) + 2_048 });
    if (!runner.ok) return { ok: false, proposalOnly: true, runner, reason: runner.reason };
    const output = record(runner.response);
    if (!output || typeof output.proposal !== "string" || !output.proposal.trim()) return { ok: false, proposalOnly: true, runner, reason: "promoter returned no proposal" };
    const evidenceValue = output.repositoryEvidence ?? output.evidence;
    if (!Array.isArray(evidenceValue) || evidenceValue.length === 0 || !evidenceValue.every((item) => typeof item === "string" && item.trim())) {
      return { ok: false, proposalOnly: true, runner, reason: "promoter proposal lacks repository evidence" };
    }
    const proposalId = makeQueryId(input.binding.sessionId, recordDigest(input.binding.sessionId, input.sourceDigest, output.proposal));
    const data: ProjectProposalData = { schemaVersion: 1, ...input.binding, proposalId, sourceDigest: input.sourceDigest, projectId: clean(input.projectId, 256) };
    return { ok: true, proposalOnly: true, proposal: data, record: makePlasticEntry(PLASTIC_PROJECT_PROPOSAL_RECORDED, data), runner };
  }

  const automatic = automaticSource(input);
  if (!automatic) return { ok: false, proposalOnly: true, reason: "automatic promotion requires a fresh binding, valid project identity, acknowledgement, and verified state" };
  const automaticInput = { ...input, projectSnapshot: automatic.state.projectSnapshot };
  const runner = await runBoundedRole({ role: "project-promoter", prompt: promptFor(automaticInput), systemPrompt: PROMOTER_SYSTEM, runtime: input.runtime, signal: input.signal, inputTokens: Math.ceil(JSON.stringify(automatic.state.projectSnapshot).length / 4) + 2_048 });
  if (!runner.ok) return { ok: false, proposalOnly: true, runner, reason: runner.reason };
  const output = record(runner.response);
  let candidate;
  try {
    candidate = validatePublicationCandidate(output?.candidate);
  } catch {
    return { ok: false, proposalOnly: true, runner, reason: "promoter returned an invalid structured candidate" };
  }
  if (!candidate.evidence || candidate.evidence.length === 0) return { ok: false, proposalOnly: true, runner, reason: "promoter candidate lacks repository evidence" };
  const proposalId = makeQueryId(input.binding.sessionId, recordDigest(input.binding.sessionId, { projectId: input.projectId, sourceDigest: automatic.sourceDigest }, candidate));
  const data: StructuredProjectProposalData = {
    schemaVersion: 1,
    ...input.binding,
    proposalId,
    sourceDigest: automatic.sourceDigest,
    projectId: input.projectId,
    candidate,
    source: automatic.source,
  };
  return { ok: true, proposalOnly: true, proposal: data, record: makePlasticEntry(PLASTIC_PROJECT_PROPOSAL_RECORDED, data), runner };
}

export const runProjectPromoter = runPromoter;
export const buildPromoterRequest = promptFor;
