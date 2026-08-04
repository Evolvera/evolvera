import { digestParts } from "../common/safety.ts";
import {
  PLASTIC_BOOTSTRAP_RECORDED,
  SCHEMA_VERSION,
  isBootstrapRecord,
  type BootstrapData,
  type SessionBinding,
  type SessionEntry,
  type PlasticEntry,
} from "./types.ts";
import {
  activeWindowDigest,
  foldLedger,
  isSourceEntry,
  makePlasticEntry,
  resolveCurrentBranch,
  sourceEntries,
} from "./ledger.ts";

export type BootstrapInput = {
  entries: SessionEntry[];
  binding: SessionBinding;
  leafId?: string | null;
  /** The result of Pi SessionManager.buildContextEntries(), not getBranch(). */
  activeEntries?: SessionEntry[];
  existingRecords?: SessionEntry[];
};
export type BootstrapState = {
  binding: SessionBinding;
  compactionEntryId?: string;
  activeEntryIds: string[];
  historicalPrefixIds: string[];
  completedTurnStartId?: string;
  completedTurnEndId?: string;
  historicalGap: "historical-unindexed";
};
export type BootstrapResult = {
  record: PlasticEntry<"plastic.bootstrap.recorded">;
  state: BootstrapState;
  appended: boolean;
};

function hasId(entry: SessionEntry): entry is SessionEntry & { id: string } {
  return typeof entry.id === "string" && entry.id.length > 0;
}
function latestCompaction(branch: SessionEntry[]): SessionEntry | undefined {
  return [...branch].reverse().find((entry) => entry.type === "compaction" && hasId(entry));
}
function sourceIds(entries: SessionEntry[]): string[] {
  return sourceEntries(entries).flatMap((entry) => hasId(entry) ? [entry.id] : []);
}
function branchOrder(branch: SessionEntry[]): Map<string, number> {
  return new Map(branch.flatMap((entry, index) => hasId(entry) ? [[entry.id, index] as const] : []));
}
function lastAssistantId(entries: SessionEntry[]): string | undefined {
  return [...entries].reverse().find((entry) => entry.type === "message" && hasId(entry)
    && (entry.message as { role?: unknown } | undefined)?.role === "assistant")?.id;
}
function firstId(entries: SessionEntry[]): string | undefined {
  return entries.find(hasId)?.id;
}
function safeActiveSources(branch: SessionEntry[], activeEntries: SessionEntry[] | undefined, compaction: SessionEntry | undefined, legacyIds: string[]): SessionEntry[] {
  const allSources = sourceEntries(branch);
  const order = branchOrder(branch);
  const contextualIds = activeEntries ? sourceIds(activeEntries) : [];
  if (contextualIds.some((id) => !order.has(id))) return [];
  const activeFromContext = contextualIds;
  if (activeFromContext.length > 0) {
    const positions = activeFromContext.map((id) => order.get(id) as number);
    if (positions.some((position, index) => index > 0 && position <= positions[index - 1])) return [];
    return activeFromContext.map((id) => branch[order.get(id) as number]).filter(isSourceEntry);
  }

  const compactionPosition = compaction && hasId(compaction) ? order.get(compaction.id) ?? -1 : -1;
  const keptId = compaction?.firstKeptEntryId;
  const keptPosition = keptId ? order.get(keptId) ?? compactionPosition + 1 : compactionPosition + 1;
  const latestLegacyPosition = legacyIds.reduce((latest, id) => Math.max(latest, order.get(id) ?? -1), -1);
  const start = Math.max(keptPosition, latestLegacyPosition + 1, 0);
  return allSources.filter((entry) => (order.get(entry.id as string) ?? -1) >= start);
}

function existingBootstrap(input: BootstrapInput, branch: SessionEntry[], activeDigest: string): PlasticEntry<"plastic.bootstrap.recorded"> | undefined {
  for (const entry of input.existingRecords ?? []) {
    if (!isBootstrapRecord(entry)) continue;
    const data = entry.data as Partial<BootstrapData>;
    if (data.schemaVersion === SCHEMA_VERSION && data.sessionId === input.binding.sessionId
      && data.generation === input.binding.generation && data.branchId === input.binding.branchId
      && data.activeDigest === activeDigest && Array.isArray(data.activeEntryIds)
      && data.activeEntryIds.every((id) => branch.some((candidate) => candidate.id === id))) {
      return entry as PlasticEntry<"plastic.bootstrap.recorded">;
    }
  }
  return undefined;
}

/** Import legacy coverage without rewriting it, and establish one branch-local active window. */
export function bootstrapSession(input: BootstrapInput): BootstrapResult {
  const branch = resolveCurrentBranch(input.entries, input.leafId);
  if (branch.length === 0) throw new Error("bootstrap requires a non-empty current branch");
  const folded = foldLedger(branch, { context: input.binding });
  const compaction = latestCompaction(branch);
  const activeSources = safeActiveSources(branch, input.activeEntries, compaction, folded.legacyCoverageIds);
  if (input.activeEntries && sourceIds(input.activeEntries).length > 0 && activeSources.length === 0) {
    throw new Error("active context is not an ordered current-branch window");
  }
  const activeEntryIds = activeSources.flatMap((entry) => hasId(entry) ? [entry.id] : []);
  const order = branchOrder(branch);
  const activeFirstPosition = activeEntryIds.length > 0 ? order.get(activeEntryIds[0]) as number : branch.length;
  const historicalPrefixIds = sourceIds(branch).filter((id) => (order.get(id) ?? -1) < activeFirstPosition);
  const completedTurnEndId = lastAssistantId(activeSources);
  const completedEndPosition = completedTurnEndId ? order.get(completedTurnEndId) as number : -1;
  const completedTurnStartId = completedEndPosition >= 0
    ? activeSources.find((entry) => (order.get(entry.id as string) ?? -1) <= completedEndPosition)?.id
    : undefined;
  const activeDigest = activeWindowDigest(activeSources);
  const previous = existingBootstrap(input, branch, activeDigest);
  if (previous) {
    const previousData = previous.data as BootstrapData;
    return {
      record: previous,
      state: {
        binding: input.binding,
        compactionEntryId: previousData.compactionEntryId,
        activeEntryIds: previousData.activeEntryIds,
        historicalPrefixIds: previousData.historicalPrefixIds,
        completedTurnStartId: previousData.completedTurnStartId,
        completedTurnEndId: previousData.completedTurnEndId,
        historicalGap: "historical-unindexed",
      },
      appended: false,
    };
  }
  const data: BootstrapData = {
    schemaVersion: SCHEMA_VERSION,
    ...input.binding,
    ...(compaction && hasId(compaction) ? { compactionEntryId: compaction.id } : {}),
    ...(activeEntryIds[0] ? { activeStartId: activeEntryIds[0] } : {}),
    ...(activeEntryIds.at(-1) ? { activeEndId: activeEntryIds.at(-1) } : {}),
    activeEntryIds,
    activeDigest,
    ...(completedTurnStartId ? { completedTurnStartId } : {}),
    ...(completedTurnEndId ? { completedTurnEndId } : {}),
    legacyCoverageIds: [...new Set(folded.legacyCoverageIds)].sort((a, b) => (order.get(a) ?? -1) - (order.get(b) ?? -1)),
    historicalPrefixIds,
    historicalGap: "historical-unindexed",
  };
  const record = makePlasticEntry(PLASTIC_BOOTSTRAP_RECORDED, data);
  return {
    record,
    state: {
      binding: input.binding,
      compactionEntryId: data.compactionEntryId,
      activeEntryIds,
      historicalPrefixIds,
      completedTurnStartId,
      completedTurnEndId,
      historicalGap: "historical-unindexed",
    },
    appended: true,
  };
}

export function isNormalBootstrapWindow(state: BootstrapState, sourceId: string): boolean {
  return state.historicalGap === "historical-unindexed" && state.activeEntryIds.includes(sourceId)
    && !state.historicalPrefixIds.includes(sourceId);
}

export function bootstrapDigest(state: BootstrapState): string {
  return digestParts(state.binding, state.activeEntryIds, state.historicalPrefixIds).slice(0, 32);
}
