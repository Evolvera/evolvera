import type { SessionEntry } from "../session/types.ts";

export type ProjectionMessage = {
  role?: unknown;
  summary?: unknown;
  [key: string]: unknown;
};

export type ProjectionInput = Readonly<{
  messages: readonly ProjectionMessage[];
  branchEntries: readonly SessionEntry[];
  contextEntries: readonly SessionEntry[];
}>;

export type ProjectionResult = Readonly<{
  messages: ProjectionMessage[];
  status: "projected" | "noop" | "blocked";
  removed: number;
  reason?: string;
}>;

type MappedCompaction = {
  messageIndex: number;
  message: ProjectionMessage;
  entry: SessionEntry;
  branchPosition: number;
  plastic?: PlasticDetails;
};

type PlasticDetails = {
  stateDigest: string;
  header: string;
  sourceEntryIds?: string[];
  range?: { fromEntryId: string; throughEntryId: string };
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function ids(entries: readonly SessionEntry[]): string[] {
  return entries.map((entry) => entry.id).filter((id): id is string => typeof id === "string" && id.length > 0);
}

function orderedBranch(entries: readonly SessionEntry[]): boolean {
  const seen = new Set<string>();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (typeof entry.id !== "string" || entry.id.length === 0 || seen.has(entry.id)) return false;
    seen.add(entry.id);
    if (index > 0 && entry.parentId !== entries[index - 1]?.id) return false;
  }
  return true;
}

function compactionDetails(entry: SessionEntry): PlasticDetails | undefined {
  if (entry.type !== "compaction") return undefined;
  const details = record(entry.details);
  const plastic = record(details?.plastic);
  if (plastic?.kind !== "cumulative" || typeof plastic.stateDigest !== "string" || plastic.stateDigest.length === 0) return undefined;
  if (typeof plastic.header !== "string" || plastic.header.length === 0) return undefined;
  const sourceEntryIds = Array.isArray(plastic.sourceEntryIds)
    && plastic.sourceEntryIds.length > 0
    && plastic.sourceEntryIds.every((id): id is string => typeof id === "string" && id.length > 0)
    && new Set(plastic.sourceEntryIds).size === plastic.sourceEntryIds.length
    ? [...plastic.sourceEntryIds]
    : undefined;
  const range = record(plastic.range);
  const structuredRange = typeof range?.fromEntryId === "string" && typeof range.throughEntryId === "string"
    ? { fromEntryId: range.fromEntryId, throughEntryId: range.throughEntryId }
    : undefined;
  if (!sourceEntryIds && !structuredRange) return undefined;
  return { stateDigest: plastic.stateDigest, header: plastic.header, ...(sourceEntryIds ? { sourceEntryIds } : {}), ...(structuredRange ? { range: structuredRange } : {}) };
}

function samePrefix(candidate: readonly number[], latest: readonly number[]): boolean {
  return candidate.length > 0 && candidate.length <= latest.length && candidate.every((position, index) => position === latest[index]);
}

function subsumed(candidate: MappedCompaction, latest: MappedCompaction, branchPositions: Map<string, number>): boolean {
  if (!candidate.plastic || !latest.plastic || candidate.branchPosition >= latest.branchPosition) return false;
  const candidateIds = candidate.plastic.sourceEntryIds;
  const latestIds = latest.plastic.sourceEntryIds;
  if (candidateIds && latestIds) {
    const candidatePositions = candidateIds.map((id) => branchPositions.get(id));
    const latestPositions = latestIds.map((id) => branchPositions.get(id));
    if (candidatePositions.some((position): position is undefined => position === undefined)
      || latestPositions.some((position): position is undefined => position === undefined)) return false;
    if (samePrefix(candidatePositions as number[], latestPositions as number[])) return true;
  }
  if (candidate.plastic.range && latest.plastic.range) {
    const candidateFrom = branchPositions.get(candidate.plastic.range.fromEntryId);
    const latestFrom = branchPositions.get(latest.plastic.range.fromEntryId);
    const candidateThrough = branchPositions.get(candidate.plastic.range.throughEntryId);
    const latestThrough = branchPositions.get(latest.plastic.range.throughEntryId);
    return candidateFrom !== undefined && latestFrom === candidateFrom
      && candidateThrough !== undefined && latestThrough !== undefined
      && candidateThrough <= latestThrough;
  }
  return false;
}

/**
 * Project repeated provider summaries without relying on summary text or an
 * entry ID (the host deliberately exposes neither on compactionSummary).
 */
export function projectPlasticContext(input: ProjectionInput): ProjectionResult {
  const messages = [...input.messages];
  if (!orderedBranch(input.branchEntries)) {
    return { messages, status: "noop", removed: 0, reason: "ambiguous branch order" };
  }
  const branchPositions = new Map(ids(input.branchEntries).map((id, index) => [id, index] as const));
  const contextCompactions = input.contextEntries.filter((entry) => entry.type === "compaction");
  const messageIndices = messages.flatMap((message, index) => message.role === "compactionSummary" ? [index] : []);
  if (messageIndices.length !== contextCompactions.length) {
    return { messages, status: "noop", removed: 0, reason: "compaction message order is ambiguous" };
  }
  const mapped: MappedCompaction[] = [];
  for (let index = 0; index < contextCompactions.length; index += 1) {
    const entry = contextCompactions[index];
    const position = typeof entry.id === "string" ? branchPositions.get(entry.id) : undefined;
    if (position === undefined) return { messages, status: "noop", removed: 0, reason: "context compaction is not on the fresh branch" };
    const messageIndex = messageIndices[index];
    mapped.push({
      messageIndex,
      message: messages[messageIndex],
      entry,
      branchPosition: position,
      plastic: compactionDetails(entry),
    });
  }
  if (mapped.length === 0) return { messages, status: "noop", removed: 0, reason: "no compaction summaries" };
  const latestOverall = mapped.reduce((current, candidate) => !current || candidate.branchPosition > current.branchPosition ? candidate : current, undefined as MappedCompaction | undefined);
  if (!latestOverall?.plastic) {
    // Native-only and native/emergency-latest contexts are deliberately
    // message-equivalent; filtering them would destroy host evidence.
    return { messages, status: "noop", removed: 0, reason: "latest compaction is native or ambiguous" };
  }
  const candidates = mapped.filter((candidate) => candidate !== latestOverall && candidate.plastic && subsumed(candidate, latestOverall, branchPositions));
  if (candidates.length === 0) return { messages, status: "noop", removed: 0, reason: "no proven subsumed plastic range" };

  const start = Math.min(...candidates.map((candidate) => candidate.branchPosition));
  const blocked = mapped.some((candidate) => candidate.branchPosition >= start
    && candidate.branchPosition < latestOverall.branchPosition
    && !candidate.plastic);
  if (blocked) return { messages, status: "blocked", removed: 0, reason: "native or ambiguous compaction lies inside removable range" };

  const removeIndices = new Set(candidates.map((candidate) => candidate.messageIndex));
  return {
    messages: messages.filter((_message, index) => !removeIndices.has(index)),
    status: "projected",
    removed: removeIndices.size,
  };
}

export const projectContext = projectPlasticContext;
export const projectProviderContext = projectPlasticContext;
