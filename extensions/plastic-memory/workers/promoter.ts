import { makeQueryId, recordDigest } from "../common/ids.ts";
import { scrubSensitiveText } from "../common/safety.ts";
import { makePlasticEntry } from "../session/ledger.ts";
import { PLASTIC_PROJECT_PROPOSAL_RECORDED, type CompactionAppliedData, type PlasticEntry, type ProjectProposalData, type SessionBinding } from "../session/types.ts";
import { runBoundedRole, type RunnerRuntime, type RunnerResult } from "./runner.ts";

export type PromoterInput = Readonly<{
  binding: SessionBinding;
  projectId: string;
  sourceDigest: string;
  projectSnapshot: unknown;
  acknowledgement?: CompactionAppliedData;
  explicitRequest?: boolean;
  runtime: RunnerRuntime;
  signal?: AbortSignal;
}>;
export type PromoterResult = Readonly<{
  ok: boolean;
  proposalOnly: true;
  proposal?: ProjectProposalData;
  record?: PlasticEntry<"plastic.project.proposal.recorded">;
  runner?: RunnerResult;
  reason?: string;
}>;

const PROMOTER_SYSTEM = "Propose project-memory changes only from repository evidence. Never write files or publish changes. Return JSON with proposal and repositoryEvidence.";
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function clean(value: string, max: number): string { return scrubSensitiveText(value).replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, max); }
function promptFor(input: PromoterInput): string {
  return JSON.stringify({ binding: input.binding, projectId: input.projectId, sourceDigest: input.sourceDigest, projectSnapshot: input.projectSnapshot, output: { proposal: "proposal text", repositoryEvidence: "nonempty repository paths/facts supporting the proposal" } });
}

/** Promotion is a proposal-only, evidence-gated role; it has no filesystem capability. */
export async function runPromoter(input: PromoterInput): Promise<PromoterResult> {
  const ack = input.acknowledgement;
  const ackMatches = Boolean(ack && ack.sessionId === input.binding.sessionId && ack.generation === input.binding.generation && ack.branchId === input.binding.branchId);
  if (!ackMatches && !input.explicitRequest) return { ok: false, proposalOnly: true, reason: "promotion requires matching compaction acknowledgement or explicit request" };
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

export const runProjectPromoter = runPromoter;
export const buildPromoterRequest = promptFor;
