import {
  CONTENT_DIGEST_PATTERN,
  LEGACY_MEMORY_ID_PATTERN,
  RECORD_DIGEST_PATTERN,
  SESSION_DIGEST_PATTERN,
  isInternalId,
  isPublicId,
} from "../common/ids.ts";
import { isProjectId, type PublicationCandidate, validatePublicationCandidate } from "../project/schema.ts";

export const SCHEMA_VERSION = 1 as const;

export const PLASTIC_OBSERVATIONS_RECORDED = "plastic.observations.recorded" as const;
export const PLASTIC_REFLECTIONS_RECORDED = "plastic.reflections.recorded" as const;
export const PLASTIC_OBSERVATIONS_DROPPED = "plastic.observations.dropped" as const;
export const PLASTIC_BOOTSTRAP_RECORDED = "plastic.bootstrap.recorded" as const;
export const PLASTIC_CYCLE_QUEUED = "plastic.cycle.queued" as const;
export const PLASTIC_CYCLE_ATTEMPTED = "plastic.cycle.attempted" as const;
export const PLASTIC_CYCLE_CLOSED = "plastic.cycle.closed" as const;
export const PLASTIC_COMPACTION_APPLIED = "plastic.compaction.applied" as const;
export const PLASTIC_BACKFILL_CURSOR_RECORDED = "plastic.backfill.cursor.recorded" as const;
export const PLASTIC_PROJECT_PROPOSAL_RECORDED = "plastic.project.proposal.recorded" as const;
export const PLASTIC_PROJECT_PROPOSAL_DECIDED = "plastic.project.proposal.decided" as const;

export const PLASTIC_TYPES = [
  PLASTIC_OBSERVATIONS_RECORDED,
  PLASTIC_REFLECTIONS_RECORDED,
  PLASTIC_OBSERVATIONS_DROPPED,
  PLASTIC_BOOTSTRAP_RECORDED,
  PLASTIC_CYCLE_QUEUED,
  PLASTIC_CYCLE_ATTEMPTED,
  PLASTIC_CYCLE_CLOSED,
  PLASTIC_COMPACTION_APPLIED,
  PLASTIC_BACKFILL_CURSOR_RECORDED,
  PLASTIC_PROJECT_PROPOSAL_RECORDED,
  PLASTIC_PROJECT_PROPOSAL_DECIDED,
] as const;
export type PlasticType = (typeof PLASTIC_TYPES)[number];

export const LEGACY_OBSERVATIONS_RECORDED = "om.observations.recorded" as const;
export const LEGACY_REFLECTIONS_RECORDED = "om.reflections.recorded" as const;
export const LEGACY_OBSERVATIONS_DROPPED = "om.observations.dropped" as const;
export const LEGACY_FOLDED = "om.folded" as const;

export type Relevance = "low" | "medium" | "high" | "critical";
export type LegacyObservation = {
  id: string;
  content: string;
  timestamp: string;
  relevance: Relevance;
  sourceEntryIds: string[];
  tokenCount: number;
};
export type LegacyReflection = {
  id: string;
  content: string;
  supportingObservationIds: string[];
  tokenCount: number;
};

export type SessionBinding = {
  sessionId: string;
  generation: number;
  branchId: string;
};

export type SourceSpan = {
  sourceStartId: string;
  sourceEndId: string;
  sourceEntryIds: string[];
  sourceDigest: string;
  completedTurnEndId: string;
};

export type Observation = LegacyObservation & {
  id: string;
};
export type Reflection = LegacyReflection & {
  id: string;
};

export type ObservationsRecordedData = SessionBinding & {
  schemaVersion: 1;
  observations: Observation[];
  span: SourceSpan;
};
export type ReflectionsRecordedData = SessionBinding & {
  schemaVersion: 1;
  reflections: Reflection[];
  span: SourceSpan;
};
export type ObservationsDroppedData = SessionBinding & {
  schemaVersion: 1;
  observationIds: string[];
  coversThroughId: string;
  reflectionIds: string[];
};

export type BootstrapData = SessionBinding & {
  schemaVersion: 1;
  compactionEntryId?: string;
  activeStartId?: string;
  activeEndId?: string;
  activeEntryIds: string[];
  activeDigest: string;
  completedTurnStartId?: string;
  completedTurnEndId?: string;
  legacyCoverageIds: string[];
  historicalPrefixIds: string[];
  historicalGap: "historical-unindexed";
};

export type CycleQueuedData = SessionBinding & SourceSpan & {
  schemaVersion: 1;
  cycleId: string;
  snapshotId: string;
  estimatedTokenCount: number;
};

export type CycleAttemptedData = SessionBinding & SourceSpan & {
  schemaVersion: 1;
  cycleId: string;
  attemptId: string;
  snapshotId: string;
  phase: "observer" | "reflector" | "compactor" | "project-promoter";
  outcome: "pending" | "complete" | "empty-valid" | "partial" | "oversized" | "failed" | "stale" | "suppressed";
  attemptCount: number;
  suppressionReason?: "automatic-retry-exhausted" | "unchanged-failed-snapshot" | "stale-identity";
};

export type CycleClosedData = SessionBinding & SourceSpan & {
  schemaVersion: 1;
  cycleId: string;
  attemptId: string;
  snapshotId: string;
  status: "complete" | "empty-valid";
  observationIds: string[];
  reflectionIds: string[];
};

export type CompactionAppliedData = SessionBinding & {
  schemaVersion: 1;
  compactionEntryId: string;
  firstKeptEntryId: string;
  activeEntryIds: string[];
  activeDigest: string;
};

export type BackfillCursorData = SessionBinding & {
  schemaVersion: 1;
  cursorId: string;
  nextEntryId?: string;
  sourceDigest: string;
};
export type ProjectProposalData = SessionBinding & {
  schemaVersion: 1;
  proposalId: string;
  sourceDigest: string;
  projectId: string;
};
export type ProjectProposalSource = {
  kind: "plastic-compaction";
  compactionEntryId: string;
  acknowledgementDigest: string;
  stateDigest: string;
};
export type StructuredProjectProposalData = SessionBinding & {
  schemaVersion: 1;
  proposalId: string;
  sourceDigest: string;
  projectId: string;
  candidate: PublicationCandidate;
  source: ProjectProposalSource;
};
export type ProjectProposalDecidedData = SessionBinding & {
  schemaVersion: 1;
  proposalId: string;
  decision: "accepted" | "rejected";
};

export type PlasticDataMap = {
  [PLASTIC_OBSERVATIONS_RECORDED]: ObservationsRecordedData;
  [PLASTIC_REFLECTIONS_RECORDED]: ReflectionsRecordedData;
  [PLASTIC_OBSERVATIONS_DROPPED]: ObservationsDroppedData;
  [PLASTIC_BOOTSTRAP_RECORDED]: BootstrapData;
  [PLASTIC_CYCLE_QUEUED]: CycleQueuedData;
  [PLASTIC_CYCLE_ATTEMPTED]: CycleAttemptedData;
  [PLASTIC_CYCLE_CLOSED]: CycleClosedData;
  [PLASTIC_COMPACTION_APPLIED]: CompactionAppliedData;
  [PLASTIC_BACKFILL_CURSOR_RECORDED]: BackfillCursorData;
  [PLASTIC_PROJECT_PROPOSAL_RECORDED]: ProjectProposalData | StructuredProjectProposalData;
  [PLASTIC_PROJECT_PROPOSAL_DECIDED]: ProjectProposalDecidedData;
};

export type PlasticEntry<K extends PlasticType = PlasticType> = {
  type: "custom";
  customType: K;
  data: PlasticDataMap[K];
  id?: string;
  parentId?: string | null;
  timestamp?: string;
};

export type SessionEntry = {
  type: string;
  id?: string;
  parentId?: string | null;
  customType?: string;
  data?: unknown;
  message?: unknown;
  content?: unknown;
  firstKeptEntryId?: string;
  details?: unknown;
  timestamp?: string;
  [key: string]: unknown;
};

export type LegacyMemoryDetails = {
  type: typeof LEGACY_FOLDED;
  version: 1;
  fullFold: boolean;
  observations: LegacyObservation[];
  reflections: LegacyReflection[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function isStringArray(value: unknown, allowEmpty = false): value is string[] {
  return Array.isArray(value) && (allowEmpty || value.length > 0) && value.every(isString);
}
function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isDigest(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.test(value);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value);
}
function isRelevance(value: unknown): value is Relevance {
  return value === "low" || value === "medium" || value === "high" || value === "critical";
}

export function isLegacyMemoryId(value: unknown): value is string {
  return typeof value === "string" && LEGACY_MEMORY_ID_PATTERN.test(value);
}
export function isLegacyObservation(value: unknown): value is LegacyObservation {
  return isRecord(value) && exactKeys(value, ["id", "content", "timestamp", "relevance", "sourceEntryIds", "tokenCount"])
    && isLegacyMemoryId(value.id) && isString(value.content) && isString(value.timestamp)
    && isRelevance(value.relevance) && isStringArray(value.sourceEntryIds) && typeof value.tokenCount === "number"
    && Number.isFinite(value.tokenCount) && value.tokenCount >= 0;
}
export function isLegacyReflection(value: unknown): value is LegacyReflection {
  return isRecord(value) && exactKeys(value, ["id", "content", "supportingObservationIds", "tokenCount"])
    && isLegacyMemoryId(value.id) && isString(value.content) && !/[\r\n]/u.test(value.content)
    && isStringArray(value.supportingObservationIds) && typeof value.tokenCount === "number"
    && Number.isFinite(value.tokenCount) && value.tokenCount >= 0;
}
function isPlasticObservation(value: unknown): value is Observation {
  return isRecord(value) && exactKeys(value, ["id", "content", "timestamp", "relevance", "sourceEntryIds", "tokenCount"])
    && typeof value.id === "string" && isPublicId(value.id) && value.id.startsWith("pm:o:")
    && isString(value.content) && isString(value.timestamp) && isRelevance(value.relevance)
    && isStringArray(value.sourceEntryIds) && typeof value.tokenCount === "number"
    && Number.isFinite(value.tokenCount) && value.tokenCount >= 0;
}
function isPlasticReflection(value: unknown): value is Reflection {
  return isRecord(value) && exactKeys(value, ["id", "content", "supportingObservationIds", "tokenCount"])
    && typeof value.id === "string" && isPublicId(value.id) && value.id.startsWith("pm:r:")
    && isString(value.content) && !/[\r\n]/u.test(value.content)
    && isStringArray(value.supportingObservationIds) && typeof value.tokenCount === "number"
    && Number.isFinite(value.tokenCount) && value.tokenCount >= 0;
}
export function isSessionBinding(value: unknown): value is SessionBinding {
  return isRecord(value) && isDigest(value.sessionId, SESSION_DIGEST_PATTERN)
    && isNonnegativeInteger(value.generation) && isString(value.branchId);
}
export function isSourceSpan(value: unknown): value is SourceSpan {
  return isRecord(value) && typeof value.sourceStartId === "string" && typeof value.sourceEndId === "string"
    && isStringArray(value.sourceEntryIds, true) && isDigest(value.sourceDigest, RECORD_DIGEST_PATTERN)
    && typeof value.completedTurnEndId === "string";
}

function isVersioned(value: unknown, requiredKeys: readonly string[], optionalKeys: readonly string[] = []): value is Record<string, unknown> {
  return isRecord(value) && value.schemaVersion === SCHEMA_VERSION
    && Object.keys(value).every((key) => requiredKeys.includes(key) || optionalKeys.includes(key))
    && requiredKeys.every((key) => key in value);
}
function isObservationsRecordedData(value: unknown): value is ObservationsRecordedData {
  return isVersioned(value, ["schemaVersion", "sessionId", "generation", "branchId", "observations", "span"])
    && isSessionBinding(value) && Array.isArray(value.observations) && value.observations.length > 0
    && value.observations.every(isPlasticObservation) && isSourceSpan(value.span);
}
function isReflectionsRecordedData(value: unknown): value is ReflectionsRecordedData {
  return isVersioned(value, ["schemaVersion", "sessionId", "generation", "branchId", "reflections", "span"])
    && isSessionBinding(value) && Array.isArray(value.reflections) && value.reflections.length > 0
    && value.reflections.every(isPlasticReflection) && isSourceSpan(value.span);
}
function isObservationsDroppedData(value: unknown): value is ObservationsDroppedData {
  return isVersioned(value, ["schemaVersion", "sessionId", "generation", "branchId", "observationIds", "coversThroughId", "reflectionIds"])
    && isSessionBinding(value) && isStringArray(value.observationIds) && isString(value.coversThroughId)
    && isStringArray(value.reflectionIds, true);
}
function isBootstrapData(value: unknown): value is BootstrapData {
  return isVersioned(value, ["schemaVersion", "sessionId", "generation", "branchId", "activeEntryIds", "activeDigest", "legacyCoverageIds", "historicalPrefixIds", "historicalGap"], ["compactionEntryId", "activeStartId", "activeEndId", "completedTurnStartId", "completedTurnEndId"])
    && isSessionBinding(value) && (value.compactionEntryId === undefined || isString(value.compactionEntryId))
    && (value.activeStartId === undefined || isString(value.activeStartId)) && (value.activeEndId === undefined || isString(value.activeEndId))
    && isStringArray(value.activeEntryIds, true) && isDigest(value.activeDigest, CONTENT_DIGEST_PATTERN)
    && (value.completedTurnStartId === undefined || isString(value.completedTurnStartId))
    && (value.completedTurnEndId === undefined || isString(value.completedTurnEndId))
    && isStringArray(value.legacyCoverageIds, true) && isStringArray(value.historicalPrefixIds, true)
    && value.historicalGap === "historical-unindexed";
}
function isCycleQueuedData(value: unknown): value is CycleQueuedData {
  return isVersioned(value, ["schemaVersion", "sessionId", "generation", "branchId", "sourceStartId", "sourceEndId", "sourceEntryIds", "sourceDigest", "completedTurnEndId", "cycleId", "snapshotId", "estimatedTokenCount"])
    && isSessionBinding(value) && isSourceSpan(value) && isStringArray(value.sourceEntryIds)
    && value.sourceStartId === value.sourceEntryIds[0] && value.sourceEndId === value.sourceEntryIds.at(-1)
    && value.completedTurnEndId === value.sourceEndId && isInternalId(value.cycleId)
    && isDigest(value.snapshotId, RECORD_DIGEST_PATTERN) && isNonnegativeInteger(value.estimatedTokenCount)
    && value.estimatedTokenCount >= 20_000;
}
function isCycleAttemptedData(value: unknown): value is CycleAttemptedData {
  return isVersioned(value, ["schemaVersion", "sessionId", "generation", "branchId", "sourceStartId", "sourceEndId", "sourceEntryIds", "sourceDigest", "completedTurnEndId", "cycleId", "attemptId", "snapshotId", "phase", "outcome", "attemptCount"], ["suppressionReason"])
    && isSessionBinding(value) && isSourceSpan(value) && isString(value.cycleId) && isString(value.attemptId) && isString(value.snapshotId)
    && (value.phase === "observer" || value.phase === "reflector" || value.phase === "compactor" || value.phase === "project-promoter")
    && (value.outcome === "pending" || value.outcome === "complete" || value.outcome === "empty-valid" || value.outcome === "partial" || value.outcome === "oversized" || value.outcome === "failed" || value.outcome === "stale" || value.outcome === "suppressed")
    && isNonnegativeInteger(value.attemptCount)
    && (value.suppressionReason === undefined || value.suppressionReason === "automatic-retry-exhausted" || value.suppressionReason === "unchanged-failed-snapshot" || value.suppressionReason === "stale-identity");
}
function isCycleClosedData(value: unknown): value is CycleClosedData {
  return isVersioned(value, ["schemaVersion", "sessionId", "generation", "branchId", "sourceStartId", "sourceEndId", "sourceEntryIds", "sourceDigest", "completedTurnEndId", "cycleId", "attemptId", "snapshotId", "status", "observationIds", "reflectionIds"])
    && isSessionBinding(value) && isSourceSpan(value) && isString(value.cycleId) && isString(value.attemptId) && isString(value.snapshotId)
    && (value.status === "complete" || value.status === "empty-valid") && isStringArray(value.observationIds, true) && isStringArray(value.reflectionIds, true);
}
function isCompactionAppliedData(value: unknown): value is CompactionAppliedData {
  return isVersioned(value, ["schemaVersion", "sessionId", "generation", "branchId", "compactionEntryId", "firstKeptEntryId", "activeEntryIds", "activeDigest"])
    && isSessionBinding(value) && isString(value.compactionEntryId) && isString(value.firstKeptEntryId)
    && isStringArray(value.activeEntryIds, true) && isDigest(value.activeDigest, CONTENT_DIGEST_PATTERN);
}
function isBackfillCursorData(value: unknown): value is BackfillCursorData {
  return isVersioned(value, ["schemaVersion", "sessionId", "generation", "branchId", "cursorId", "sourceDigest"], ["nextEntryId"])
    && isSessionBinding(value) && isString(value.cursorId) && (value.nextEntryId === undefined || isString(value.nextEntryId)) && isDigest(value.sourceDigest, RECORD_DIGEST_PATTERN);
}
function isProjectProposalMetadataData(value: unknown): value is ProjectProposalData {
  return isVersioned(value, ["schemaVersion", "sessionId", "generation", "branchId", "proposalId", "sourceDigest", "projectId"])
    && isSessionBinding(value) && isString(value.proposalId) && isDigest(value.sourceDigest, RECORD_DIGEST_PATTERN) && isString(value.projectId);
}
function isProjectProposalSource(value: unknown): value is ProjectProposalSource {
  return isRecord(value) && exactKeys(value, ["kind", "compactionEntryId", "acknowledgementDigest", "stateDigest"])
    && value.kind === "plastic-compaction" && isString(value.compactionEntryId)
    && isDigest(value.acknowledgementDigest, RECORD_DIGEST_PATTERN)
    && isDigest(value.stateDigest, CONTENT_DIGEST_PATTERN);
}
function isProjectProposalStructuredData(value: unknown): value is StructuredProjectProposalData {
  if (!isVersioned(value, ["schemaVersion", "sessionId", "generation", "branchId", "proposalId", "sourceDigest", "projectId", "candidate", "source"])) return false;
  if (!isSessionBinding(value) || !isString(value.proposalId) || !isDigest(value.sourceDigest, RECORD_DIGEST_PATTERN) || !isProjectId(value.projectId) || !isProjectProposalSource(value.source)) return false;
  try {
    const candidate = validatePublicationCandidate(value.candidate);
    return candidate !== undefined;
  } catch {
    return false;
  }
}
function isProjectProposalData(value: unknown): value is ProjectProposalData | StructuredProjectProposalData {
  return isProjectProposalMetadataData(value) || isProjectProposalStructuredData(value);
}
function isProjectProposalDecidedData(value: unknown): value is ProjectProposalDecidedData {
  return isVersioned(value, ["schemaVersion", "sessionId", "generation", "branchId", "proposalId", "decision"])
    && isSessionBinding(value) && isString(value.proposalId) && (value.decision === "accepted" || value.decision === "rejected");
}

export function isPlasticType(value: unknown): value is PlasticType {
  return typeof value === "string" && (PLASTIC_TYPES as readonly string[]).includes(value);
}
export function isPlasticRecord(value: unknown): value is PlasticEntry {
  if (!isRecord(value) || value.type !== "custom" || !isPlasticType(value.customType)) return false;
  switch (value.customType) {
    case PLASTIC_OBSERVATIONS_RECORDED: return isObservationsRecordedData(value.data);
    case PLASTIC_REFLECTIONS_RECORDED: return isReflectionsRecordedData(value.data);
    case PLASTIC_OBSERVATIONS_DROPPED: return isObservationsDroppedData(value.data);
    case PLASTIC_BOOTSTRAP_RECORDED: return isBootstrapData(value.data);
    case PLASTIC_CYCLE_QUEUED: return isCycleQueuedData(value.data);
    case PLASTIC_CYCLE_ATTEMPTED: return isCycleAttemptedData(value.data);
    case PLASTIC_CYCLE_CLOSED: return isCycleClosedData(value.data);
    case PLASTIC_COMPACTION_APPLIED: return isCompactionAppliedData(value.data);
    case PLASTIC_BACKFILL_CURSOR_RECORDED: return isBackfillCursorData(value.data);
    case PLASTIC_PROJECT_PROPOSAL_RECORDED: return isProjectProposalData(value.data);
    case PLASTIC_PROJECT_PROPOSAL_DECIDED: return isProjectProposalDecidedData(value.data);
  }
}

export function isBootstrapRecord(value: unknown): value is PlasticEntry<typeof PLASTIC_BOOTSTRAP_RECORDED> {
  return isPlasticRecord(value) && value.customType === PLASTIC_BOOTSTRAP_RECORDED;
}
export function isCycleQueuedRecord(value: unknown): value is PlasticEntry<typeof PLASTIC_CYCLE_QUEUED> {
  return isPlasticRecord(value) && value.customType === PLASTIC_CYCLE_QUEUED;
}
export function isCycleAttemptedRecord(value: unknown): value is PlasticEntry<typeof PLASTIC_CYCLE_ATTEMPTED> {
  return isPlasticRecord(value) && value.customType === PLASTIC_CYCLE_ATTEMPTED;
}
export function isCycleClosedRecord(value: unknown): value is PlasticEntry<typeof PLASTIC_CYCLE_CLOSED> {
  return isPlasticRecord(value) && value.customType === PLASTIC_CYCLE_CLOSED;
}
export function isCompactionAppliedRecord(value: unknown): value is PlasticEntry<typeof PLASTIC_COMPACTION_APPLIED> {
  return isPlasticRecord(value) && value.customType === PLASTIC_COMPACTION_APPLIED;
}
export function isBackfillCursorRecord(value: unknown): value is PlasticEntry<typeof PLASTIC_BACKFILL_CURSOR_RECORDED> {
  return isPlasticRecord(value) && value.customType === PLASTIC_BACKFILL_CURSOR_RECORDED;
}
export function isProjectProposalRecord(value: unknown): value is PlasticEntry<typeof PLASTIC_PROJECT_PROPOSAL_RECORDED> {
  return isPlasticRecord(value) && value.customType === PLASTIC_PROJECT_PROPOSAL_RECORDED;
}
export function isStructuredProjectProposalData(value: unknown): value is StructuredProjectProposalData {
  return isProjectProposalStructuredData(value);
}
export function isMetadataProjectProposalData(value: unknown): value is ProjectProposalData {
  return isProjectProposalMetadataData(value);
}
export function isStructuredProjectProposalRecord(value: unknown): value is PlasticEntry<typeof PLASTIC_PROJECT_PROPOSAL_RECORDED> & { data: StructuredProjectProposalData } {
  return isPlasticRecord(value) && value.customType === PLASTIC_PROJECT_PROPOSAL_RECORDED && isProjectProposalStructuredData(value.data);
}
export function isProjectProposalDecidedRecord(value: unknown): value is PlasticEntry<typeof PLASTIC_PROJECT_PROPOSAL_DECIDED> {
  return isPlasticRecord(value) && value.customType === PLASTIC_PROJECT_PROPOSAL_DECIDED;
}

export function isLegacyObservationsRecorded(value: unknown): boolean {
  return isRecord(value) && value.type === "custom" && value.customType === LEGACY_OBSERVATIONS_RECORDED
    && isRecord(value.data) && isStringArray(value.data.observations) === false
    && Array.isArray(value.data.observations) && value.data.observations.length > 0
    && value.data.observations.every(isLegacyObservation) && isString(value.data.coversUpToId);
}
export function isLegacyReflectionsRecorded(value: unknown): boolean {
  return isRecord(value) && value.type === "custom" && value.customType === LEGACY_REFLECTIONS_RECORDED
    && isRecord(value.data) && Array.isArray(value.data.reflections) && value.data.reflections.length > 0
    && value.data.reflections.every(isLegacyReflection) && isString(value.data.coversUpToId);
}
export function isLegacyObservationsDropped(value: unknown): boolean {
  return isRecord(value) && value.type === "custom" && value.customType === LEGACY_OBSERVATIONS_DROPPED
    && isRecord(value.data) && isStringArray(value.data.observationIds) && isString(value.data.coversUpToId);
}
export function isLegacyFolded(value: unknown): value is { type: "custom"; customType: typeof LEGACY_FOLDED; data: LegacyMemoryDetails } {
  if (!isRecord(value) || value.type !== "custom" || value.customType !== LEGACY_FOLDED || !isRecord(value.data)) return false;
  return exactKeys(value.data, ["type", "version", "fullFold", "observations", "reflections"])
    && value.data.type === LEGACY_FOLDED && value.data.version === 1 && typeof value.data.fullFold === "boolean"
    && Array.isArray(value.data.observations) && value.data.observations.every(isLegacyObservation)
    && Array.isArray(value.data.reflections) && value.data.reflections.every(isLegacyReflection);
}

export function isAnyLegacyRecord(value: unknown): boolean {
  return isLegacyObservationsRecorded(value) || isLegacyReflectionsRecorded(value) || isLegacyObservationsDropped(value) || isLegacyFolded(value);
}
