import { digestParts, assertBoundedString, assertNoSensitiveText, scrubSensitiveText } from "../common/safety.ts";
import type { ProjectContext } from "../project/context.ts";
import { factsDigest, sourceFactsDigest, type CycleSourceFacts, type StructuredFacts } from "./extract.ts";

export const SUMMARY_CAP_CHARS = 48_000;
export type ProjectSnapshot = Readonly<{ summary: string; activeIndex: string; architectureIndex?: string }>;
export type CumulativeState = Readonly<{
  version: 1;
  cycleIds: string[];
  sourceEntryIds: string[];
  sourceDigests: string[];
  facts: StructuredFacts;
  projectSnapshot: ProjectSnapshot;
  stateDigest: string;
}>;
export type LunaRequest = Readonly<{
  cycleIds: string[];
  sourceEntryIds: string[];
  sourceDigests: string[];
  sourceFactsDigest: string;
  priorState: CumulativeState | undefined;
  facts: StructuredFacts;
  projectSnapshot: ProjectSnapshot;
}>;
export type RenderedCompaction = Readonly<{
  summary: string;
  details: Readonly<Record<string, unknown>>;
  state: CumulativeState;
  cycleRange: string;
  stateDigest: string;
  sourceEntryIds: string[];
  sourceDigests: string[];
}>;

type LunaResult = {
  summary?: unknown;
  state?: unknown;
  details?: unknown;
  facts?: unknown;
};

function unique(values: string[]): string[] { return [...new Set(values)]; }
function clean(value: unknown, maximum = SUMMARY_CAP_CHARS): string {
  return scrubSensitiveText(typeof value === "string" ? value : "").replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, maximum);
}
function factsObject(value: unknown): StructuredFacts {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const list = (key: keyof StructuredFacts): string[] => Array.isArray(source[key]) ? source[key].filter((item): item is string => typeof item === "string").map((item) => clean(item, 2_000)) : [];
  return {
    activeMemoryIds: unique(list("activeMemoryIds")),
    files: unique(list("files")),
    commands: unique(list("commands")),
    errors: unique(list("errors")),
    decisions: unique(list("decisions")),
    constraints: unique(list("constraints")),
    goals: unique(list("goals")),
    openLoops: unique(list("openLoops")),
  };
}
function mergeFacts(left: StructuredFacts | undefined, right: StructuredFacts): StructuredFacts {
  const a = left ?? { activeMemoryIds: [], files: [], commands: [], errors: [], decisions: [], constraints: [], goals: [], openLoops: [] };
  return {
    activeMemoryIds: unique([...a.activeMemoryIds, ...right.activeMemoryIds]),
    files: unique([...a.files, ...right.files]),
    commands: unique([...a.commands, ...right.commands]),
    errors: unique([...a.errors, ...right.errors]),
    decisions: unique([...a.decisions, ...right.decisions]),
    constraints: unique([...a.constraints, ...right.constraints]),
    goals: unique([...a.goals, ...right.goals]),
    openLoops: unique([...a.openLoops, ...right.openLoops]),
  };
}
function snapshotOf(value: unknown): ProjectSnapshot {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const nested = input.compactorInput && typeof input.compactorInput === "object" ? input.compactorInput as Record<string, unknown> : input;
  const summary = clean(nested.summary, 8_000);
  const activeIndex = clean(nested.activeIndex ?? nested.activeChunkIndex, 4_000);
  const architectureIndex = typeof nested.architectureIndex === "string" ? clean(nested.architectureIndex, 4_000) : undefined;
  return { summary, activeIndex, ...(architectureIndex ? { architectureIndex } : {}) };
}
function stateDigestFor(value: Omit<CumulativeState, "stateDigest">): string {
  return digestParts(value).slice(0, 32);
}
function makeState(cycles: CycleSourceFacts[], prior: CumulativeState | undefined, projectSnapshot: ProjectSnapshot, facts: StructuredFacts): CumulativeState {
  const base = {
    version: 1 as const,
    cycleIds: unique([...(prior?.cycleIds ?? []), ...cycles.map((cycle) => cycle.cycleId)]),
    sourceEntryIds: unique([...(prior?.sourceEntryIds ?? []), ...cycles.flatMap((cycle) => cycle.sourceEntryIds)]),
    sourceDigests: unique([...(prior?.sourceDigests ?? []), ...cycles.map((cycle) => cycle.sourceDigest)]),
    facts,
    projectSnapshot,
  };
  return { ...base, stateDigest: stateDigestFor(base) };
}
function requiredKeys(): (keyof StructuredFacts)[] { return ["activeMemoryIds", "files", "commands", "errors", "decisions", "constraints", "goals", "openLoops"]; }
function verifyAndRepairFacts(candidate: unknown, required: StructuredFacts): StructuredFacts {
  const proposed = factsObject(candidate);
  const repaired = { ...proposed } as Record<keyof StructuredFacts, string[]>;
  for (const key of requiredKeys()) repaired[key] = unique([...required[key], ...proposed[key]]);
  return repaired;
}
function stateFromLuna(candidate: unknown, expected: CumulativeState, required: StructuredFacts): CumulativeState {
  const source = candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate as Record<string, unknown> : {};
  const repairedFacts = verifyAndRepairFacts(source.facts, required);
  const suppliedCycles = Array.isArray(source.cycleIds) ? source.cycleIds.filter((item): item is string => typeof item === "string") : [];
  const suppliedEntries = Array.isArray(source.sourceEntryIds) ? source.sourceEntryIds.filter((item): item is string => typeof item === "string") : [];
  const suppliedDigests = Array.isArray(source.sourceDigests) ? source.sourceDigests.filter((item): item is string => typeof item === "string") : [];
  const exactOrRepair = (supplied: string[], expectedValue: string[], label: string): string[] => {
    if (supplied.length === 0) return [...expectedValue];
    if (JSON.stringify(supplied) !== JSON.stringify(expectedValue)) throw new Error(`Luna ${label} identity mismatch`);
    return [...expectedValue];
  };
  const base = {
    version: 1 as const,
    cycleIds: exactOrRepair(suppliedCycles, expected.cycleIds, "cycle").slice(),
    sourceEntryIds: exactOrRepair(suppliedEntries, expected.sourceEntryIds, "source entry").slice(),
    sourceDigests: exactOrRepair(suppliedDigests, expected.sourceDigests, "source digest").slice(),
    facts: repairedFacts,
    projectSnapshot: expected.projectSnapshot,
  };
  return { ...base, stateDigest: stateDigestFor(base) };
}
function assertStateBounded(state: CumulativeState): void {
  const serialized = JSON.stringify(state);
  assertBoundedString(serialized, SUMMARY_CAP_CHARS, "structured compaction state");
  assertNoSensitiveText(serialized, "structured compaction state");
}
function assertPriorState(state: CumulativeState | undefined): void {
  if (!state) return;
  if (state.version !== 1 || new Set(state.cycleIds).size !== state.cycleIds.length || new Set(state.sourceEntryIds).size !== state.sourceEntryIds.length) throw new Error("prior structured state is malformed");
  const { stateDigest, ...base } = state;
  if (stateDigestFor(base) !== state.stateDigest) throw new Error("prior structured state digest mismatch");
  assertStateBounded(state);
}

export function projectSnapshot(value: ProjectContext | ProjectSnapshot | unknown): ProjectSnapshot { return snapshotOf(value); }

export function buildLunaRequest(cycles: CycleSourceFacts[], priorState: CumulativeState | undefined, snapshot: ProjectSnapshot, facts: StructuredFacts): LunaRequest {
  return {
    cycleIds: cycles.map((cycle) => cycle.cycleId),
    sourceEntryIds: cycles.flatMap((cycle) => cycle.sourceEntryIds),
    sourceDigests: cycles.map((cycle) => cycle.sourceDigest),
    sourceFactsDigest: sourceFactsDigest(cycles),
    priorState,
    facts,
    projectSnapshot: snapshot,
  };
}

export function summaryHeader(cycleRange: string, stateDigest: string): string {
  return `PLASTIC-COMPACTION cycle-range=${cycleRange} state-digest=${stateDigest}`;
}

export function renderVerifiedCompaction(
  cycles: CycleSourceFacts[],
  priorState: CumulativeState | undefined,
  snapshotInput: ProjectContext | ProjectSnapshot | unknown,
  luna: (request: LunaRequest) => LunaResult,
): RenderedCompaction {
  if (cycles.length === 0) throw new Error("compaction requires at least one cycle");
  const snapshot = snapshotOf(snapshotInput);
  assertPriorState(priorState);
  const extracted = cycles.reduce((facts, cycle) => mergeFacts(facts, cycle.facts), priorState?.facts);
  const expected = makeState(cycles, priorState, snapshot, extracted);
  const request = buildLunaRequest(cycles, priorState, snapshot, extracted);
  const response = luna(request);
  const state = stateFromLuna(response?.state, expected, extracted);
  assertStateBounded(state);
  const cycleRange = `${cycles[0].cycleId}..${cycles.at(-1)?.cycleId}`;
  const header = summaryHeader(cycleRange, state.stateDigest);
  const body = clean(response?.summary, SUMMARY_CAP_CHARS);
  const summary = body.startsWith(header) ? body : `${header}\n${body || "Verified cumulative structured state."}`;
  assertBoundedString(summary, SUMMARY_CAP_CHARS, "compaction summary");
  assertNoSensitiveText(summary, "compaction summary");
  const details = {
    plastic: {
      kind: "cumulative",
      state: "verified",
      cycleRange,
      stateDigest: state.stateDigest,
      cycleIds: [...state.cycleIds],
      sourceEntryIds: [...state.sourceEntryIds],
      sourceDigests: [...state.sourceDigests],
      factsDigest: factsDigest(state.facts),
      projectSnapshotDigest: digestParts(snapshot).slice(0, 32),
      header,
      priorCompactionStateDigest: priorState?.stateDigest,
    },
    structuredState: state,
  } as const;
  assertBoundedString(JSON.stringify(details), SUMMARY_CAP_CHARS, "compaction details");
  return { summary, details, state, cycleRange, stateDigest: state.stateDigest, sourceEntryIds: [...state.sourceEntryIds], sourceDigests: [...state.sourceDigests] };
}

export function verifyCumulativeState(state: CumulativeState): boolean {
  try { assertPriorState(state); return true; } catch { return false; }
}

export function verifyRenderedCompaction(rendered: RenderedCompaction): boolean {
  try {
    const plastic = rendered.details.plastic as Record<string, unknown>;
    return rendered.summary.startsWith(String(plastic.header))
      && plastic.stateDigest === rendered.stateDigest
      && plastic.cycleRange === rendered.cycleRange
      && JSON.stringify(rendered.state.sourceEntryIds) === JSON.stringify(rendered.sourceEntryIds)
      && rendered.state.stateDigest === rendered.stateDigest;
  } catch { return false; }
}
