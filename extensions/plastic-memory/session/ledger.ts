import { digestParts } from "../common/safety.ts";
import {
  isAnyLegacyRecord,
  isLegacyFolded,
  isLegacyObservationsDropped,
  isLegacyObservationsRecorded,
  isLegacyReflectionsRecorded,
  isPlasticRecord,
  LEGACY_FOLDED,
  LEGACY_OBSERVATIONS_DROPPED,
  LEGACY_OBSERVATIONS_RECORDED,
  LEGACY_REFLECTIONS_RECORDED,
  PLASTIC_OBSERVATIONS_DROPPED,
  PLASTIC_OBSERVATIONS_RECORDED,
  PLASTIC_REFLECTIONS_RECORDED,
  PLASTIC_COMPACTION_APPLIED,
  type BootstrapData,
  type CompactionAppliedData,
  type LegacyObservation,
  type LegacyReflection,
  type PlasticDataMap,
  type PlasticEntry,
  type PlasticType,
  type SessionBinding,
  type SessionEntry,
} from "./types.ts";

const SOURCE_ENTRY_TYPES = new Set(["message", "custom_message", "branch_summary"]);

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
  if (isPlasticRecord(entry) && "span" in entry.data) return entry.data.span.sourceEntryIds;
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
  const legacyCoverageIds: string[] = [];

  for (const entry of branch) {
    if (isPlasticRecord(entry)) {
      if (!validNewRecordForBranch(entry, branchIds, options.context)) continue;
      if (entry.customType === PLASTIC_OBSERVATIONS_RECORDED) {
        for (const observation of entry.data.observations) if (!observationsById.has(observation.id)) observationsById.set(observation.id, observation);
      } else if (entry.customType === PLASTIC_REFLECTIONS_RECORDED) {
        for (const reflection of entry.data.reflections) if (!reflectionsById.has(reflection.id)) reflectionsById.set(reflection.id, reflection);
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
    legacyCoverageIds,
  };
}

/** Select only the explicitly bootstrapped active window; historical gaps cannot re-enter normal work. */
export function normalSourceEntries(branch: SessionEntry[], bootstrap?: BootstrapData): SessionEntry[] {
  if (!bootstrap) return [];
  const allowed = new Set(bootstrap.activeEntryIds);
  const selected = sourceEntries(branch).filter((entry) => hasId(entry) && allowed.has(entry.id));
  if (selected.length !== bootstrap.activeEntryIds.filter((id) => branch.some((entry) => entry.id === id && isSourceEntry(entry))).length) return [];
  return selected;
}

export function acceptsBoundRecord(entry: unknown, context: SessionBinding): boolean {
  return isPlasticRecord(entry) && entry.data.sessionId === context.sessionId
    && entry.data.generation === context.generation && entry.data.branchId === context.branchId;
}

export function makePlasticEntry<K extends PlasticType>(customType: K, data: PlasticDataMap[K]): PlasticEntry<K> {
  return { type: "custom", customType, data } as PlasticEntry<K>;
}

export { activeWindowDigest as digestActiveWindow };
