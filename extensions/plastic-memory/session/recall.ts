import {
  isLegacyMemoryId,
  isLegacyObservationsRecorded,
  isLegacyReflectionsRecorded,
  isPlasticRecord,
  PLASTIC_OBSERVATIONS_RECORDED,
  PLASTIC_REFLECTIONS_RECORDED,
  PLASTIC_PROJECT_PROPOSAL_RECORDED,
  type LegacyObservation,
  type LegacyReflection,
  type SessionBinding,
  type SessionEntry,
} from "./types.ts";
import { foldLedger, isSourceEntry, resolveCurrentBranch } from "./ledger.ts";
import { scrubSensitiveText } from "../common/safety.ts";
import type { SearchFilters as ProjectSearchFilters, SearchMatch as ProjectSearchMatch } from "../project/search.ts";

const NAMESPACED_MEMORY_ID = /^pm:(?:o|r|q):[a-f0-9]{24}:[a-f0-9]{24}$/;
const MAX_QUERY = 500;
const MAX_RESULTS = 100;

type MemoryKind = "observation" | "reflection";
export type RecallStatus = "not_found" | "found" | "partial" | "unavailable";

export type RecalledObservation = {
  observation: LegacyObservation;
  observationEntryId: string;
  observationRecordIndex: number;
  status: "active" | "dropped";
  sourceEntryIds: string[];
  sourceEntries: SessionEntry[];
  missingSourceEntryIds: string[];
  nonSourceEntryIds: string[];
};
export type RecalledReflection = {
  reflection: LegacyReflection;
  reflectionEntryId: string;
  reflectionRecordIndex: number;
};
export type RecalledProposal = {
  proposal: Record<string, unknown>;
  proposalEntryId: string;
};
export type SessionRecallResult = {
  status: RecallStatus;
  state: RecallStatus;
  memoryId: string;
  kind?: MemoryKind | "proposal" | "mixed";
  observations: RecalledObservation[];
  reflections: RecalledReflection[];
  proposals: RecalledProposal[];
  sourceEntries: SessionEntry[];
  missingSourceEntryIds: string[];
  nonSourceEntryIds: string[];
  missingSupportingObservationIds: string[];
  collision: boolean;
  partial: boolean;
  unavailable: boolean;
  tombstones: string[];
  reason?: string;
};

export type SessionRecallInput = Readonly<{
  entries: SessionEntry[];
  binding?: SessionBinding;
  leafId?: string | null;
  id: string;
}>;

export type MemorySearchMatch = {
  namespace: "session" | "project";
  id: string;
  kind: string;
  category: string;
  title: string;
  status: string;
  confidence: string;
  tags: string[];
  snippet: string;
  score: number;
  projectId?: string;
};
export type MemorySearchResult = {
  status: "found" | "unavailable";
  state: "found" | "unavailable";
  matches: MemorySearchMatch[];
  reason?: string;
};
export type MemorySearchInput = Readonly<{
  entries?: SessionEntry[];
  binding?: SessionBinding;
  leafId?: string | null;
  projectRoot?: string;
  projectSearch?: (root: string, filters: ProjectSearchFilters) => { status: "found" | "unavailable"; matches: ProjectSearchMatch[]; reason?: string };
  filters?: ProjectSearchFilters;
}>;

function empty(memoryId: string, reason?: string): SessionRecallResult {
  return {
    status: reason ? "unavailable" : "not_found",
    state: reason ? "unavailable" : "not_found",
    memoryId,
    observations: [],
    reflections: [],
    proposals: [],
    sourceEntries: [],
    missingSourceEntryIds: [],
    nonSourceEntryIds: [],
    missingSupportingObservationIds: [],
    collision: false,
    partial: false,
    unavailable: false,
    tombstones: [],
    ...(reason ? { reason } : {}),
  };
}
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function recordData(entry: SessionEntry): Record<string, unknown> | undefined {
  return entry.data && typeof entry.data === "object" && !Array.isArray(entry.data) ? entry.data as Record<string, unknown> : undefined;
}
function entryIds(entries: SessionEntry[]): Set<string> { return new Set(entries.flatMap((entry) => typeof entry.id === "string" ? [entry.id] : [])); }
function sameBinding(value: Record<string, unknown>, binding: SessionBinding | undefined): boolean {
  return !binding || (value.sessionId === binding.sessionId && value.generation === binding.generation && value.branchId === binding.branchId);
}
function validPlasticForBranch(entry: SessionEntry, branchIds: Set<string>, binding?: SessionBinding): boolean {
  if (!isPlasticRecord(entry) || !sameBinding(entry.data as unknown as Record<string, unknown>, binding)) return false;
  const data = entry.data as unknown as Record<string, unknown>;
  const span = data.span as { sourceEntryIds?: unknown } | undefined;
  if (span && Array.isArray(span.sourceEntryIds) && span.sourceEntryIds.some((id) => typeof id !== "string" || !branchIds.has(id))) return false;
  return true;
}
/** Exact namespaced recall can cross a rebase, never a session/branch boundary or future generation. */
function validHistoricalPlasticForBranch(entry: SessionEntry, branchIds: Set<string>, binding: SessionBinding | undefined): boolean {
  if (!binding || !isPlasticRecord(entry) || !validPlasticForBranch(entry, branchIds)) return false;
  const data = entry.data;
  return data.sessionId === binding.sessionId
    && Number.isSafeInteger(data.generation) && data.generation >= 0 && data.generation < binding.generation;
}
function validHistoricalObservation(value: LegacyObservation, sourceById: Map<string, SessionEntry>): boolean {
  return value.sourceEntryIds.length > 0 && value.sourceEntryIds.every((sourceId) => {
    const source = sourceById.get(sourceId);
    return Boolean(source && isSourceEntry(source));
  });
}
function validMemoryId(id: string): boolean { return isLegacyMemoryId(id) || NAMESPACED_MEMORY_ID.test(id); }
function memoryIdAllowed(id: string, raw: boolean): boolean { return raw ? isLegacyMemoryId(id) : NAMESPACED_MEMORY_ID.test(id); }

function observationTags(content: string): string[] {
  const tags = new Set<string>();
  for (const match of content.matchAll(/#([a-z0-9][a-z0-9_-]*)/giu)) {
    tags.add(match[1].toLowerCase());
    if (tags.size >= 20) break;
  }
  return [...tags].sort();
}
function compact(value: string, limit = 240): string {
  const text = scrubSensitiveText(value).replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim();
  return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 16))} [truncated]`;
}
function queryTokens(value: string | undefined): string[] {
  return value?.toLowerCase().trim().split(/\s+/u).filter(Boolean) ?? [];
}
function matchesCommon(item: { category: string; status: string; confidence: string; tags: string[]; text: string }, filters: ProjectSearchFilters, tokens: string[]): boolean {
  if (filters.category !== undefined && item.category !== filters.category) return false;
  if (filters.status !== undefined && item.status !== filters.status) return false;
  if (filters.confidence !== undefined && item.confidence !== filters.confidence) return false;
  const wantedTags = [...new Set([...(filters.tag ? [filters.tag] : []), ...(filters.tags ?? [])].map((tag) => tag.toLowerCase()))];
  if (wantedTags.some((tag) => !item.tags.includes(tag))) return false;
  const haystack = item.text.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

/** Exact recall over the injected current branch. It never reads a session file or an off-branch parent. */
export function recallSession(input: SessionRecallInput): SessionRecallResult {
  const memoryId = input?.id;
  if (typeof memoryId !== "string") return empty("", "MALFORMED_ID: expected a lowercase 12-hex or namespaced session id");
  if (!validMemoryId(memoryId)) return empty(memoryId, "MALFORMED_ID: expected a lowercase 12-hex or pm:o:/pm:r:/pm:q: session id");
  const raw = isLegacyMemoryId(memoryId);
  if (!memoryIdAllowed(memoryId, raw)) return empty(memoryId, "MALFORMED_ID: unsupported session namespace");
  if (!Array.isArray(input.entries)) return empty(memoryId, "UNAVAILABLE: current branch was not supplied");

  const folded = foldLedger(input.entries, { leafId: input.leafId, context: input.binding });
  const branch = folded.branch;
  const branchIds = entryIds(branch);
  const sourceById = new Map(branch.flatMap((entry) => typeof entry.id === "string" ? [[entry.id, entry] as const] : []));
  const historicalObservations = new Map<number, Map<string, { value: LegacyObservation; entryId: string; recordIndex: number }>>();
  if (!raw && input.binding) {
    for (const entry of branch) {
      if (!validHistoricalPlasticForBranch(entry, branchIds, input.binding) || entry.customType !== PLASTIC_OBSERVATIONS_RECORDED) continue;
      const byId = historicalObservations.get(entry.data.generation) ?? new Map<string, { value: LegacyObservation; entryId: string; recordIndex: number }>();
      for (const [recordIndex, value] of entry.data.observations.entries()) {
        if (validHistoricalObservation(value, sourceById) && !byId.has(value.id)) byId.set(value.id, { value, entryId: entry.id!, recordIndex });
      }
      historicalObservations.set(entry.data.generation, byId);
    }
  }
  const observations: Array<{ value: LegacyObservation; entryId: string; recordIndex: number }> = [];
  const reflections: Array<{ value: LegacyReflection; entryId: string; recordIndex: number; historicalGeneration?: number }> = [];
  const proposals: Array<{ value: Record<string, unknown>; entryId: string }> = [];
  for (const entry of branch) {
    if (isLegacyObservationsRecorded(entry)) {
      entry.data.observations.forEach((value, recordIndex) => { if (value.id === memoryId) observations.push({ value, entryId: entry.id!, recordIndex }); });
    } else if (isLegacyReflectionsRecorded(entry)) {
      entry.data.reflections.forEach((value, recordIndex) => { if (value.id === memoryId) reflections.push({ value, entryId: entry.id!, recordIndex }); });
    } else {
      const current = validPlasticForBranch(entry, branchIds, input.binding);
      const historical = !raw && validHistoricalPlasticForBranch(entry, branchIds, input.binding);
      if (!current && !historical) continue;
      if (entry.customType === PLASTIC_OBSERVATIONS_RECORDED) {
        entry.data.observations.forEach((value, recordIndex) => {
          if (value.id === memoryId && (!historical || validHistoricalObservation(value, sourceById))) observations.push({ value, entryId: entry.id!, recordIndex });
        });
      }
      if (entry.customType === PLASTIC_REFLECTIONS_RECORDED) {
        const supports = historical ? historicalObservations.get(entry.data.generation) : undefined;
        entry.data.reflections.forEach((value, recordIndex) => {
          if (value.id === memoryId && (!historical || value.supportingObservationIds.every((id) => supports?.has(id)))) {
            reflections.push({ value, entryId: entry.id!, recordIndex, ...(historical ? { historicalGeneration: entry.data.generation } : {}) });
          }
        });
      }
      if (current && entry.customType === PLASTIC_PROJECT_PROPOSAL_RECORDED && entry.data.proposalId === memoryId) proposals.push({ value: entry.data as unknown as Record<string, unknown>, entryId: entry.id! });
    }
  }
  if (observations.length === 0 && reflections.length === 0 && proposals.length === 0) return empty(memoryId);

  const currentObservations = new Map([...folded.observationsById].map(([id, value]) => [id, { value, entryId: "folded", recordIndex: 0 }]));
  const recalledObservations: RecalledObservation[] = [];
  const sourceEntries: SessionEntry[] = [];
  const missingSourceEntryIds: string[] = [];
  const nonSourceEntryIds: string[] = [];
  const addObservation = (value: LegacyObservation, entryId: string, recordIndex: number): void => {
    const sourceIds = unique(value.sourceEntryIds);
    const found: SessionEntry[] = [];
    const missing: string[] = [];
    const nonSource: string[] = [];
    for (const sourceId of sourceIds) {
      const source = sourceById.get(sourceId);
      if (!source) missing.push(sourceId);
      else if (!isSourceEntry(source)) nonSource.push(sourceId);
      else found.push(source);
    }
    sourceEntries.push(...found);
    missingSourceEntryIds.push(...missing);
    nonSourceEntryIds.push(...nonSource);
    recalledObservations.push({ observation: value, observationEntryId: entryId, observationRecordIndex: recordIndex, status: folded.droppedObservationIds.has(value.id) ? "dropped" : "active", sourceEntryIds: sourceIds, sourceEntries: found, missingSourceEntryIds: missing, nonSourceEntryIds: nonSource });
  };
  observations.forEach((item) => addObservation(item.value, item.entryId, item.recordIndex));

  const missingSupportingObservationIds: string[] = [];
  for (const item of reflections) {
    const historicalSupports = item.historicalGeneration === undefined ? undefined : historicalObservations.get(item.historicalGeneration);
    for (const observationId of unique(item.value.supportingObservationIds)) {
      const supporting = historicalSupports?.get(observationId) ?? (item.historicalGeneration === undefined ? currentObservations.get(observationId) : undefined);
      if (!supporting) missingSupportingObservationIds.push(observationId);
      else if (!recalledObservations.some((match) => match.observation === supporting.value)) addObservation(supporting.value, supporting.entryId, supporting.recordIndex);
    }
  }
  const missing = unique([...missingSourceEntryIds, ...nonSourceEntryIds, ...missingSupportingObservationIds]);
  const partial = missing.length > 0;
  const unavailable = (missingSourceEntryIds.length + nonSourceEntryIds.length > 0) && sourceEntries.length === 0;
  const status: RecallStatus = unavailable ? "unavailable" : partial ? "partial" : "found";
  return {
    status,
    state: status,
    memoryId,
    kind: proposals.length > 0 && (observations.length > 0 || reflections.length > 0) ? "mixed" : proposals.length > 0 ? "proposal" : observations.length > 0 && reflections.length > 0 ? "mixed" : reflections.length > 0 ? "reflection" : "observation",
    observations: recalledObservations,
    reflections: reflections.map((item) => ({ reflection: item.value, reflectionEntryId: item.entryId, reflectionRecordIndex: item.recordIndex })),
    proposals: proposals.map((item) => ({ proposal: item.value, proposalEntryId: item.entryId })),
    sourceEntries: unique(sourceEntries),
    missingSourceEntryIds: unique(missingSourceEntryIds),
    nonSourceEntryIds: unique(nonSourceEntryIds),
    missingSupportingObservationIds: unique(missingSupportingObservationIds),
    collision: observations.length + reflections.length > 1,
    partial,
    unavailable,
    tombstones: unique(recalledObservations.filter((item) => item.status === "dropped").map((item) => item.observation.id)),
  };
}
export const recall = recallSession;

/** Bounded lexical search over eligible folded session records and an injected current project root. */
export function searchMemory(input: MemorySearchInput = {}): MemorySearchResult {
  const filters = input.filters ?? {};
  if (filters === null || typeof filters !== "object" || Array.isArray(filters)) throw new Error("search filters must be an object");
  const allowedFilters = new Set(["text", "tag", "tags", "category", "status", "confidence", "limit"]);
  for (const key of Object.keys(filters)) if (!allowedFilters.has(key)) throw new Error(`unsupported search filter: ${key}`);
  if (filters.text !== undefined && (typeof filters.text !== "string" || filters.text.length > MAX_QUERY)) throw new Error("search text is invalid or exceeds its bound");
  if (filters.tag !== undefined && (typeof filters.tag !== "string" || !filters.tag.trim() || filters.tag.length > 80)) throw new Error("search tag is invalid");
  if (filters.tags !== undefined && (!Array.isArray(filters.tags) || filters.tags.length > 20 || filters.tags.some((tag) => typeof tag !== "string" || !tag.trim() || tag.length > 80))) throw new Error("search tags are invalid");
  const limit = filters.limit ?? 20;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_RESULTS) throw new Error("search limit is invalid");
  const tokens = queryTokens(filters.text);
  const matches: MemorySearchMatch[] = [];
  if (Array.isArray(input.entries)) {
    const folded = foldLedger(input.entries, { leafId: input.leafId, context: input.binding });
    for (const observation of folded.activeObservations) {
      const tags = observationTags(observation.content);
      const text = [observation.id, observation.content, observation.relevance, ...tags].join(" ");
      const item = { category: "session-observation", status: "active", confidence: observation.relevance, tags, text };
      if (!matchesCommon(item, filters, tokens)) continue;
      const score = tokens.reduce((total, token) => total + (text.toLowerCase().split(token).length - 1), 0) + tags.length;
      matches.push({ namespace: "session", id: observation.id, kind: "observation", ...item, title: `Observation ${observation.id}`, snippet: compact(observation.content), score });
    }
    for (const reflection of folded.reflections) {
      const tags = observationTags(reflection.content);
      const text = [reflection.id, reflection.content, "reflection", ...tags].join(" ");
      const item = { category: "session-reflection", status: "recorded", confidence: "unknown", tags, text };
      if (!matchesCommon(item, filters, tokens)) continue;
      const score = tokens.reduce((total, token) => total + (text.toLowerCase().split(token).length - 1), 0) + tags.length;
      matches.push({ namespace: "session", id: reflection.id, kind: "reflection", ...item, title: `Reflection ${reflection.id}`, snippet: compact(reflection.content), score });
    }
  }
  if (input.projectRoot && !(typeof filters.category === "string" && filters.category.startsWith("session-"))) {
    const projectFilters = { ...filters, ...(typeof filters.category === "string" && filters.category.startsWith("session-") ? { category: undefined } : {}) };
    const projectSearch = requireProjectSearch(input.projectRoot, projectFilters, input.projectSearch);
    if (projectSearch.status === "unavailable") return { status: "unavailable", state: "unavailable", matches, reason: projectSearch.reason };
    matches.push(...projectSearch.matches.map((match) => projectMatch(match)));
  }
  matches.sort((a, b) => b.score - a.score || a.namespace.localeCompare(b.namespace) || a.id.localeCompare(b.id));
  return { status: "found", state: "found", matches: matches.slice(0, limit) };
}

function requireProjectSearch(root: string, filters: ProjectSearchFilters, searcher?: MemorySearchInput["projectSearch"]): { status: "found" | "unavailable"; matches: ProjectSearchMatch[]; reason?: string } {
  if (!searcher) return { status: "unavailable", matches: [], reason: "PROJECT_SEARCH_UNAVAILABLE: no injected current-project search engine" };
  return searcher(root, filters);
}
function projectMatch(match: ProjectSearchMatch): MemorySearchMatch {
  return { namespace: "project", id: match.id, projectId: match.projectId, kind: "chunk", category: match.category, title: match.title, status: match.status, confidence: match.confidence, tags: match.tags, snippet: compact(match.snippet), score: match.score };
}
export const search = searchMemory;
