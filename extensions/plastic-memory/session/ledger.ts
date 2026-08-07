import { canonicalJson, digestParts } from "../common/safety.ts";
import { recordDigest } from "../common/ids.ts";
import {
  isAnyLegacyRecord,
  isBootstrapRecord,
  isCompactionAppliedRecord,
  isProjectProposalDecidedRecord,
  isStructuredProjectProposalRecord,
  isCycleQueuedRecord,
  isLegacyFolded,
  isLegacyObservationsDropped,
  isLegacyObservationsRecorded,
  isLegacyReflectionsRecorded,
  isPlasticRecord,
  LEGACY_FOLDED,
  LEGACY_OBSERVATIONS_DROPPED,
  LEGACY_OBSERVATIONS_RECORDED,
  LEGACY_REFLECTIONS_RECORDED,
  PLASTIC_CYCLE_QUEUED,
  PLASTIC_OBSERVATIONS_DROPPED,
  PLASTIC_OBSERVATIONS_RECORDED,
  PLASTIC_REFLECTIONS_RECORDED,
  PLASTIC_COMPACTION_APPLIED,
  PLASTIC_PROJECT_PROPOSAL_DECIDED,
  type BootstrapData,
  type CompactionAppliedData,
  type CycleQueuedData,
  type LegacyObservation,
  type LegacyReflection,
  type PlasticDataMap,
  type PlasticEntry,
  type PlasticType,
  type ProjectProposalDecidedData,
  type SessionBinding,
  type StructuredProjectProposalData,
  type SessionEntry,
} from "./types.ts";

const SOURCE_ENTRY_TYPES = new Set(["message", "custom_message", "branch_summary"]);
const CONTEXT_ENTRY_TYPES = new Set(["message", "custom_message", "branch_summary", "compaction"]);

export type LedgerContext = SessionBinding;
export type FoldedLedger = {
  branch: SessionEntry[];
  observations: LegacyObservation[];
  activeObservations: LegacyObservation[];
  reflections: LegacyReflection[];
  observationsById: Map<string, LegacyObservation>;
  reflectionsById: Map<string, LegacyReflection>;
  droppedObservationIds: Set<string>;
  bootstraps: BootstrapData[];
  latestBootstrap?: BootstrapData;
  compactions: SessionEntry[];
  compactionAcknowledgements: CompactionAppliedData[];
  queuedCycles: CycleQueuedData[];
  legacyCoverageIds: string[];
};

function hasId(entry: SessionEntry): entry is SessionEntry & { id: string } {
  return typeof entry.id === "string" && entry.id.length > 0;
}
function customData(entry: SessionEntry): Record<string, unknown> | undefined {
  return entry.data !== null && typeof entry.data === "object" && !Array.isArray(entry.data)
    ? entry.data as Record<string, unknown> : undefined;
}
function isOnBranch(branchIds: Set<string>, id: unknown): id is string {
  return typeof id === "string" && branchIds.has(id);
}

/** Follow the same leaf-parent branch model as Pi 0.83.0 without touching a live SessionManager. */
export function resolveCurrentBranch(entries: SessionEntry[], leafId?: string | null): SessionEntry[] {
  const candidates = entries.filter((entry) => entry.type !== "session" && hasId(entry));
  const byId = new Map(candidates.map((entry) => [entry.id, entry]));
  let current = leafId ? byId.get(leafId) : candidates.at(-1);
  if (!current) return [];
  const path: SessionEntry[] = [];
  const seen = new Set<string>();
  while (current && hasId(current) && !seen.has(current.id)) {
    seen.add(current.id);
    path.push(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  if (current) return [];
  path.reverse();
  return path;
}

export function isSourceEntry(entry: SessionEntry): boolean {
  return SOURCE_ENTRY_TYPES.has(entry.type) && hasId(entry);
}
/** Require unique IDs everywhere, then strict parent ordering from the first context entry onward. */
export function hasOrderedContextTail(entries: readonly SessionEntry[]): boolean {
  const ids = new Set<string>();
  let anchor = -1;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!hasId(entry) || ids.has(entry.id)) return false;
    ids.add(entry.id);
    if (anchor < 0 && CONTEXT_ENTRY_TYPES.has(entry.type)) anchor = index;
  }
  if (anchor < 0) return false;
  if (anchor > 0 && entries[anchor].parentId !== entries[anchor - 1].id) return false;
  for (let index = anchor + 1; index < entries.length; index += 1) {
    if (entries[index].parentId !== entries[index - 1].id) return false;
  }
  return true;
}
export function sourceEntries(branch: SessionEntry[]): SessionEntry[] {
  return branch.filter(isSourceEntry);
}
export function entryIndexById(entries: SessionEntry[]): Map<string, number> {
  return new Map(entries.flatMap((entry, index) => hasId(entry) ? [[entry.id, index] as const] : []));
}
export function sourceDigest(entries: SessionEntry[]): string {
  return digestParts(entries.map((entry) => ({
    id: entry.id,
    parentId: entry.parentId ?? null,
    type: entry.type,
    message: entry.message,
    content: entry.content,
    customType: entry.customType,
    data: entry.data,
  }))).slice(0, 24);
}
export function activeWindowDigest(entries: SessionEntry[]): string {
  return digestParts(entries.map((entry) => entry.id)).slice(0, 32);
}

function legacyCoverageId(entry: SessionEntry): string | undefined {
  const data = customData(entry);
  return typeof data?.coversUpToId === "string" ? data.coversUpToId : undefined;
}
function recordSourceIds(entry: SessionEntry): string[] {
  if (!isPlasticRecord(entry)) return [];
  const data = entry.data as Record<string, unknown>;
  if (Array.isArray(data.sourceEntryIds)) return data.sourceEntryIds.filter((id): id is string => typeof id === "string");
  const span = data.span;
  if (span && typeof span === "object" && !Array.isArray(span) && Array.isArray((span as Record<string, unknown>).sourceEntryIds)) {
    return ((span as Record<string, unknown>).sourceEntryIds as unknown[]).filter((id): id is string => typeof id === "string");
  }
  return [];
}
function validNewRecordForBranch(entry: SessionEntry, branchIds: Set<string>, context?: LedgerContext): boolean {
  if (!isPlasticRecord(entry)) return false;
  if (context && (entry.data.sessionId !== context.sessionId || entry.data.generation !== context.generation || entry.data.branchId !== context.branchId)) return false;
  const ids = recordSourceIds(entry);
  if (ids.length > 0 && !ids.every((id) => branchIds.has(id))) return false;
  if (entry.customType === PLASTIC_COMPACTION_APPLIED) {
    return branchIds.has(entry.data.compactionEntryId) && branchIds.has(entry.data.firstKeptEntryId);
  }
  if (entry.customType === "plastic.bootstrap.recorded") {
    return entry.data.activeEntryIds.every((id) => branchIds.has(id))
      && entry.data.historicalPrefixIds.every((id) => branchIds.has(id))
      && (!entry.data.compactionEntryId || branchIds.has(entry.data.compactionEntryId));
  }
  if (entry.customType === PLASTIC_OBSERVATIONS_DROPPED) {
    return branchIds.has(entry.data.coversThroughId);
  }
  return true;
}

/** Fold only current-branch evidence. First valid observation/reflection wins; drops remain tombstones. */
export function foldLedger(entries: SessionEntry[], options: { leafId?: string | null; context?: LedgerContext } = {}): FoldedLedger {
  const branch = resolveCurrentBranch(entries, options.leafId);
  const branchIds = new Set(branch.flatMap((entry) => hasId(entry) ? [entry.id] : []));
  const observationsById = new Map<string, LegacyObservation>();
  const reflectionsById = new Map<string, LegacyReflection>();
  const droppedObservationIds = new Set<string>();
  const bootstraps: BootstrapData[] = [];
  const compactions = branch.filter((entry) => entry.type === "compaction");
  const compactionAcknowledgements: CompactionAppliedData[] = [];
  const queuedCycles: CycleQueuedData[] = [];
  const legacyCoverageIds: string[] = [];

  for (const entry of branch) {
    if (isPlasticRecord(entry)) {
      if (!validNewRecordForBranch(entry, branchIds, options.context)) continue;
      if (entry.customType === PLASTIC_OBSERVATIONS_RECORDED) {
        for (const observation of entry.data.observations) if (!observationsById.has(observation.id)) observationsById.set(observation.id, observation);
      } else if (entry.customType === PLASTIC_REFLECTIONS_RECORDED) {
        for (const reflection of entry.data.reflections) if (!reflectionsById.has(reflection.id)) reflectionsById.set(reflection.id, reflection);
      } else if (entry.customType === PLASTIC_CYCLE_QUEUED && isCycleQueuedRecord(entry)) {
        queuedCycles.push(entry.data);
      } else if (entry.customType === PLASTIC_OBSERVATIONS_DROPPED) {
        entry.data.observationIds.forEach((id) => droppedObservationIds.add(id));
      } else if (entry.customType === "plastic.bootstrap.recorded") {
        bootstraps.push(entry.data);
      } else if (entry.customType === PLASTIC_COMPACTION_APPLIED) {
        compactionAcknowledgements.push(entry.data);
      }
      continue;
    }
    if (!isAnyLegacyRecord(entry)) continue;
    if (isLegacyObservationsRecorded(entry)) {
      for (const observation of entry.data.observations) if (!observationsById.has(observation.id)) observationsById.set(observation.id, observation);
      const covered = legacyCoverageId(entry);
      if (isOnBranch(branchIds, covered)) legacyCoverageIds.push(covered);
    } else if (isLegacyReflectionsRecorded(entry)) {
      for (const reflection of entry.data.reflections) if (!reflectionsById.has(reflection.id)) reflectionsById.set(reflection.id, reflection);
      const covered = legacyCoverageId(entry);
      if (isOnBranch(branchIds, covered)) legacyCoverageIds.push(covered);
    } else if (isLegacyObservationsDropped(entry)) {
      const covered = legacyCoverageId(entry);
      if (isOnBranch(branchIds, covered)) {
        entry.data.observationIds.forEach((id) => droppedObservationIds.add(id));
        legacyCoverageIds.push(covered);
      }
    } else if (isLegacyFolded(entry)) {
      for (const observation of entry.data.observations) if (!observationsById.has(observation.id)) observationsById.set(observation.id, observation);
      for (const reflection of entry.data.reflections) if (!reflectionsById.has(reflection.id)) reflectionsById.set(reflection.id, reflection);
    }
  }

  const observations = [...observationsById.values()];
  return {
    branch,
    observations,
    activeObservations: observations.filter((observation) => !droppedObservationIds.has(observation.id)),
    reflections: [...reflectionsById.values()],
    observationsById,
    reflectionsById,
    droppedObservationIds,
    bootstraps,
    latestBootstrap: bootstraps.at(-1),
    compactions,
    compactionAcknowledgements,
    queuedCycles,
    legacyCoverageIds,
  };
}

/** Select the active window and current-branch descendants without reopening the historical gap. */
export function normalSourceEntries(branch: SessionEntry[], bootstrap?: BootstrapData): SessionEntry[] {
  if (!bootstrap || bootstrap.historicalGap !== "historical-unindexed") return [];

  const branchPositions = new Map<string, number>();
  for (const [index, entry] of branch.entries()) {
    if (!hasId(entry) || branchPositions.has(entry.id)) return [];
    branchPositions.set(entry.id, index);
  }
  const sources = sourceEntries(branch);
  const sourceById = new Map<string, SessionEntry>();
  for (const entry of sources) {
    if (!hasId(entry) || sourceById.has(entry.id)) return [];
    sourceById.set(entry.id, entry);
  }

  const activeIds = bootstrap.activeEntryIds;
  const historicalIds = bootstrap.historicalPrefixIds;
  const allRecordedIds = new Set<string>();
  for (const id of [...historicalIds, ...activeIds]) {
    if (allRecordedIds.has(id) || !sourceById.has(id)) return [];
    allRecordedIds.add(id);
  }
  if (bootstrap.compactionEntryId && !branchPositions.has(bootstrap.compactionEntryId)) return [];

  const historicalPositions = historicalIds.map((id) => branchPositions.get(id) as number);
  const activePositions = activeIds.map((id) => branchPositions.get(id) as number);
  if (historicalPositions.some((position, index) => index > 0 && position <= historicalPositions[index - 1])) return [];
  if (activePositions.some((position, index) => index > 0 && position <= activePositions[index - 1])) return [];
  const sameIds = (left: unknown, right: string[]): boolean => Array.isArray(left)
    && left.length === right.length && left.every((id, index) => id === right[index]);
  const bootstrapPosition = [...branch].reverse().findIndex((entry) => {
    const data = customData(entry);
    return entry.customType === "plastic.bootstrap.recorded" && data
      && (bootstrap.sessionId === undefined || data.sessionId === bootstrap.sessionId)
      && (bootstrap.generation === undefined || data.generation === bootstrap.generation)
      && (bootstrap.branchId === undefined || data.branchId === bootstrap.branchId)
      && (bootstrap.activeDigest === undefined || data.activeDigest === bootstrap.activeDigest)
      && sameIds(data.activeEntryIds, activeIds) && sameIds(data.historicalPrefixIds, historicalIds);
  });
  const anchorPosition = bootstrapPosition >= 0 ? branch.length - 1 - bootstrapPosition : undefined;

  if (activeIds.length > 0) {
    if (bootstrap.activeStartId && bootstrap.activeStartId !== activeIds[0]) return [];
    if (bootstrap.activeEndId && bootstrap.activeEndId !== activeIds.at(-1)) return [];
    if (historicalPositions.some((position) => position >= activePositions[0])) return [];
  } else {
    if (bootstrap.activeStartId || bootstrap.activeEndId) return [];
    // A genuinely fresh session has no active window and no historical prefix; its own
    // bootstrap record is then the only legitimate anchor, and it bounds the sources to the
    // entries appended after it, so the historical gap still cannot be reopened.
    if (historicalIds.length === 0 && anchorPosition === undefined) return [];
  }

  let boundary = activePositions.at(-1) ?? historicalPositions.at(-1) ?? anchorPosition;
  if (boundary === undefined) return [];
  if (anchorPosition !== undefined) {
    boundary = anchorPosition;
    if (activePositions.some((position) => position >= boundary)
      || historicalPositions.some((position) => position >= boundary)) return [];
  }
  const activeSet = new Set(activeIds);
  return sources.filter((entry) => activeSet.has(entry.id as string)
    || (branchPositions.get(entry.id as string) as number) > boundary);
}

export function acceptsBoundRecord(entry: unknown, context: SessionBinding): boolean {
  return isPlasticRecord(entry) && entry.data.sessionId === context.sessionId
    && entry.data.generation === context.generation && entry.data.branchId === context.branchId;
}

export type ProposalQueueInput = {
  entries?: SessionEntry[];
  branchEntries?: SessionEntry[];
  leafId?: string | null;
  records?: SessionEntry[];
  /** Optional filter for callers that are reconstructing one session from a mixed branch. */
  binding?: SessionBinding;
};
export type ProposalQueueState = {
  valid: boolean;
  branch: SessionEntry[];
  queued: Array<PlasticEntry<"plastic.project.proposal.recorded"> & { data: StructuredProjectProposalData }>;
  unresolved: Array<PlasticEntry<"plastic.project.proposal.recorded"> & { data: StructuredProjectProposalData }>;
  decisions: Array<PlasticEntry<"plastic.project.proposal.decided">>;
  head?: PlasticEntry<"plastic.project.proposal.recorded"> & { data: StructuredProjectProposalData };
  restartCandidate?: PlasticEntry<"plastic.project.proposal.recorded"> & { data: StructuredProjectProposalData };
  reason?: string;
};

function objectData(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function sameBinding(left: SessionBinding, right: SessionBinding): boolean {
  return left.sessionId === right.sessionId && left.generation === right.generation && left.branchId === right.branchId;
}
function branchRecordIsStrict(entry: SessionEntry, branchIds: Set<string>): boolean {
  if (!isPlasticRecord(entry)) return false;
  const ids = recordSourceIds(entry);
  if (ids.some((id) => !branchIds.has(id))) return false;
  if (entry.customType === PLASTIC_COMPACTION_APPLIED) {
    return branchIds.has(entry.data.compactionEntryId) && branchIds.has(entry.data.firstKeptEntryId);
  }
  if (entry.customType === "plastic.bootstrap.recorded") {
    return entry.data.activeEntryIds.every((id) => branchIds.has(id))
      && entry.data.historicalPrefixIds.every((id) => branchIds.has(id))
      && (!entry.data.compactionEntryId || branchIds.has(entry.data.compactionEntryId));
  }
  return true;
}
function compactionState(entry: SessionEntry): { stateDigest: string; projectSnapshot: Record<string, unknown> } | undefined {
  if (entry.type !== "compaction") return undefined;
  const details = objectData(entry.details);
  const state = objectData(details?.structuredState);
  const snapshot = objectData(state?.projectSnapshot);
  return typeof state?.stateDigest === "string" && snapshot ? { stateDigest: state.stateDigest, projectSnapshot: snapshot } : undefined;
}
function proposalSourceIsValid(
  proposal: PlasticEntry<"plastic.project.proposal.recorded"> & { data: StructuredProjectProposalData },
  branch: SessionEntry[],
  branchIds: Set<string>,
  proposalIndex: number,
): boolean {
  const source = proposal.data.source;
  const compactions = branch
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry, index }) => index < proposalIndex && entry.type === "compaction" && entry.id === source.compactionEntryId);
  if (compactions.length !== 1) return false;
  const host = compactions[0];
  const state = compactionState(host.entry);
  if (!state || state.stateDigest !== source.stateDigest) return false;

  const acknowledgements = branch
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry, index }) => index > host.index && index < proposalIndex
      && isCompactionAppliedRecord(entry)
      && branchRecordIsStrict(entry, branchIds)
      && entry.data.sessionId === proposal.data.sessionId
      && entry.data.compactionEntryId === source.compactionEntryId);
  if (acknowledgements.length !== 1) return false;
  const acknowledgement = acknowledgements[0];
  const acknowledgementDigest = recordDigest(proposal.data.sessionId, { kind: "plastic-compaction-acknowledgement" }, acknowledgement.entry.data);
  if (source.acknowledgementDigest !== acknowledgementDigest) return false;
  const sourceDigest = recordDigest(proposal.data.sessionId, {
    compactionEntryId: source.compactionEntryId,
    acknowledgementDigest,
    stateDigest: source.stateDigest,
  }, state.projectSnapshot);
  if (proposal.data.sourceDigest !== sourceDigest) return false;

  return branch.some((entry, index) => index < proposalIndex
    && isBootstrapRecord(entry)
    && branchRecordIsStrict(entry, branchIds)
    && sameBinding(entry.data, proposal.data)
    && entry.data.sessionId === proposal.data.sessionId);
}

/** Reconstruct only strict structured proposals whose source and destination evidence is on this Pi ancestry. */
export function reconstructProposalQueue(input: ProposalQueueInput = {}): ProposalQueueState {
  const supplied = input.branchEntries ?? input.entries ?? input.records;
  const branch = supplied ? resolveCurrentBranch(supplied, input.leafId) : [];
  if (supplied && branch.length === 0) return { valid: false, branch: [], queued: [], unresolved: [], decisions: [], reason: "invalid current branch" };
  const branchIds = new Set(branch.flatMap((entry) => hasId(entry) ? [entry.id] : []));
  const records = (input.records ?? branch).filter((entry) => hasId(entry) && branchIds.has(entry.id));
  const strictProposals: Array<{ entry: PlasticEntry<"plastic.project.proposal.recorded"> & { data: StructuredProjectProposalData }; index: number }> = [];
  for (const [index, entry] of branch.entries()) {
    if (!isStructuredProjectProposalRecord(entry)) continue;
    if (input.binding && entry.data.sessionId !== input.binding.sessionId) continue;
    if (records.some((candidate) => candidate.id === entry.id)) strictProposals.push({ entry, index });
  }
  const strictById = new Map<string, typeof strictProposals[number]>();
  for (const proposal of strictProposals) {
    const previous = strictById.get(proposal.entry.data.proposalId);
    if (previous && canonicalJson(previous.entry.data) !== canonicalJson(proposal.entry.data)) {
      return { valid: false, branch, queued: [], unresolved: [], decisions: [], reason: "conflicting proposal duplicate" };
    }
    if (!previous) strictById.set(proposal.entry.data.proposalId, proposal);
  }
  const proposals: Array<typeof strictProposals[number]> = [];
  for (const proposal of strictProposals) {
    if (proposalSourceIsValid(proposal.entry, branch, branchIds, proposal.index)) proposals.push(proposal);
  }
  const byProposalId = new Map<string, typeof proposals[number]>();
  for (const proposal of proposals) if (!byProposalId.has(proposal.entry.data.proposalId)) byProposalId.set(proposal.entry.data.proposalId, proposal);
  const queued = [...byProposalId.values()].sort((left, right) => left.index - right.index).map(({ entry }) => entry);
  const decisions = records
    .filter((entry): entry is PlasticEntry<"plastic.project.proposal.decided"> => isProjectProposalDecidedRecord(entry))
    .sort((left, right) => branch.findIndex((entry) => entry.id === left.id) - branch.findIndex((entry) => entry.id === right.id));
  const terminalByProposal = new Map<string, PlasticEntry<"plastic.project.proposal.decided">>();
  for (const proposal of [...byProposalId.values()].sort((left, right) => left.index - right.index)) {
    const decision = decisions.find((candidate) => {
      const index = branch.findIndex((entry) => entry.id === candidate.id);
      return index > proposal.index && candidate.data.proposalId === proposal.entry.data.proposalId && sameBinding(candidate.data, proposal.entry.data);
    });
    if (decision) terminalByProposal.set(proposal.entry.data.proposalId, decision);
  }
  const unresolved = queued.filter((proposal) => !terminalByProposal.has(proposal.data.proposalId));
  const head = unresolved[0];
  return { valid: true, branch, queued, unresolved, decisions, ...(head ? { head, restartCandidate: head } : {}) };
}

export const reconstructProjectProposalQueue = reconstructProposalQueue;
export const reconstructProposalFIFO = reconstructProposalQueue;
export const selectOldestUnresolvedProposal = (state: ProposalQueueState): ProposalQueueState["head"] => state.valid ? state.unresolved[0] : undefined;
export const proposalQueueHead = selectOldestUnresolvedProposal;

/** Build a terminal decision using only the exact binding carried by a structured proposal. */
export function makeProposalDecision(
  proposal: unknown,
  decision: ProjectProposalDecidedData["decision"],
  expectedBinding?: SessionBinding,
): PlasticEntry<"plastic.project.proposal.decided"> {
  if (!isStructuredProjectProposalRecord(proposal)) throw new Error("proposal decision requires a strict structured proposal");
  if (expectedBinding && !sameBinding(proposal.data, expectedBinding)) throw new Error("proposal binding does not match decision context");
  const data: ProjectProposalDecidedData = {
    schemaVersion: 1,
    sessionId: proposal.data.sessionId,
    generation: proposal.data.generation,
    branchId: proposal.data.branchId,
    proposalId: proposal.data.proposalId,
    decision,
  };
  return makePlasticEntry(PLASTIC_PROJECT_PROPOSAL_DECIDED, data);
}
export const createProposalDecision = makeProposalDecision;
export const decideProposal = makeProposalDecision;

export function makePlasticEntry<K extends PlasticType>(customType: K, data: PlasticDataMap[K]): PlasticEntry<K> {
  return { type: "custom", customType, data } as PlasticEntry<K>;
}

export { activeWindowDigest as digestActiveWindow };
