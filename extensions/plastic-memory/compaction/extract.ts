import { digestParts, scrubSensitiveText } from "../common/safety.ts";
import { sourceDigest } from "../session/ledger.ts";
import type { CycleClosedData, SessionEntry } from "../session/types.ts";

export type StructuredFacts = Readonly<{
  activeMemoryIds: string[];
  files: string[];
  commands: string[];
  errors: string[];
  decisions: string[];
  constraints: string[];
  goals: string[];
  openLoops: string[];
}>;

export type CycleSourceFacts = Readonly<{
  cycleId: string;
  sourceEntryIds: string[];
  sourceDigest: string;
  sourceStartId: string;
  sourceEndId: string;
  completedTurnEndId: string;
  facts: StructuredFacts;
  factsDigest: string;
}>;

const PATH_KEYS = ["path", "file_path", "filePath", "filename", "file", "target_file", "file_uri"];
const COMMAND_KEYS = ["command", "cmd", "script"];
const MUTATING_WORDS = /(?:write|edit|patch|replace|append|create|update|insert|delete|remove|unlink)/iu;
const ERROR_WORDS = /(?:error|failed|failure|exception|cannot|unable|not found|permission denied|syntax error|command not found)/iu;
const CHOICE_WORDS = /(?:must|need to|require|never|avoid|do not|don't|should use|prefer|use .* instead)/iu;
const LOOP_WORDS = /(?:todo|next step|follow[- ]?up|still need|blocked|waiting|remaining|fix later)/iu;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function messageOf(entry: SessionEntry): Record<string, unknown> | undefined {
  return record(entry.message) ?? (entry.type === "message" ? record(entry) : undefined);
}
function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((part) => {
    if (typeof part === "string") return part;
    const item = record(part);
    return typeof item?.text === "string" ? item.text : typeof item?.thinking === "string" ? item.thinking : "";
  }).join(" ");
}
function messageText(entry: SessionEntry): string {
  const message = messageOf(entry);
  return textOf(message?.content ?? entry.content).replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim();
}
function contentParts(entry: SessionEntry): Record<string, unknown>[] {
  const message = messageOf(entry);
  const content = message?.content ?? entry.content;
  return Array.isArray(content) ? content.map(record).filter((part): part is Record<string, unknown> => Boolean(part)) : [];
}
function toolName(part: Record<string, unknown>): string { return typeof part.name === "string" ? part.name : "unknown"; }
function toolArgs(part: Record<string, unknown>): Record<string, unknown> {
  return record(part.arguments) ?? {};
}
function unique(values: string[]): string[] { return [...new Set(values.filter((value) => value.length > 0))]; }
function clean(value: string, max = 1_000): string { return scrubSensitiveText(value).replace(/\s+/gu, " ").trim().slice(0, max); }

export function extractStructuredFacts(entries: SessionEntry[], activeMemoryIds: string[] = []): StructuredFacts {
  const files: string[] = [];
  const commands: string[] = [];
  const errors: string[] = [];
  const decisions: string[] = [];
  const constraints: string[] = [];
  const goals: string[] = [];
  const openLoops: string[] = [];
  const toolCalls = new Map<string, { name: string; args: Record<string, unknown> }>();

  for (const entry of entries) {
    const message = messageOf(entry);
    const role = typeof message?.role === "string" ? message.role : "";
    const text = messageText(entry);
    if (role === "user" && text) {
      if (goals.length === 0) goals.push(clean(text));
      if (CHOICE_WORDS.test(text)) constraints.push(clean(text));
      if (LOOP_WORDS.test(text)) openLoops.push(clean(text));
    }
    for (const part of contentParts(entry)) {
      if (part.type !== "toolCall") continue;
      const id = typeof part.id === "string" ? part.id : `${entry.id ?? "entry"}:${toolCalls.size}`;
      const args = toolArgs(part);
      toolCalls.set(id, { name: toolName(part), args });
      for (const key of PATH_KEYS) if (typeof args[key] === "string" && args[key]) files.push(args[key] as string);
      for (const key of COMMAND_KEYS) if (typeof args[key] === "string" && args[key]) commands.push(clean(args[key] as string, 2_000));
      if (toolName(part).toLowerCase().includes("ask_user")) {
        const question = typeof args.question === "string" ? args.question : typeof args.prompt === "string" ? args.prompt : "";
        if (question) decisions.push(clean(question));
      }
    }
    if (role === "toolResult") {
      const result = record(entry.message) ?? entry;
      const resultText = clean(text);
      const isError = result.isError === true || ERROR_WORDS.test(resultText);
      if (isError && resultText) errors.push(resultText);
      const callId = typeof result.toolCallId === "string" ? result.toolCallId : undefined;
      const call = callId ? toolCalls.get(callId) : undefined;
      if (call && typeof call.args.path === "string") files.push(call.args.path);
      if (call?.name.toLowerCase().includes("ask_user") && resultText) decisions.push(resultText);
    }
    if (role === "assistant" && text && LOOP_WORDS.test(text)) openLoops.push(clean(text));
  }
  for (const entry of entries) {
    const text = messageText(entry);
    const message = messageOf(entry);
    if (message?.role === "assistant" && text && /(?:decided|we will|chosen|decision)/iu.test(text)) decisions.push(clean(text));
  }
  return {
    activeMemoryIds: unique(activeMemoryIds),
    files: unique(files),
    commands: unique(commands),
    errors: unique(errors),
    decisions: unique(decisions),
    constraints: unique(constraints),
    goals: unique(goals),
    openLoops: unique(openLoops),
  };
}

export function factsDigest(facts: StructuredFacts): string { return digestParts(facts).slice(0, 32); }

export function extractCycleSourceFacts(cycle: CycleClosedData, entries: SessionEntry[], activeMemoryIds: string[] = []): CycleSourceFacts {
  const byId = new Map(entries.flatMap((entry) => typeof entry.id === "string" ? [[entry.id, entry] as const] : []));
  const sourceEntries = cycle.sourceEntryIds.map((id) => byId.get(id)).filter((entry): entry is SessionEntry => Boolean(entry));
  const facts = extractStructuredFacts(sourceEntries, activeMemoryIds);
  return {
    cycleId: cycle.cycleId,
    sourceEntryIds: [...cycle.sourceEntryIds],
    sourceDigest: cycle.sourceDigest,
    sourceStartId: cycle.sourceStartId,
    sourceEndId: cycle.sourceEndId,
    completedTurnEndId: cycle.completedTurnEndId,
    facts,
    factsDigest: factsDigest(facts),
  };
}

export function verifyCycleSourceDigest(cycle: CycleClosedData, entries: SessionEntry[]): boolean {
  const byId = new Map(entries.flatMap((entry) => typeof entry.id === "string" ? [[entry.id, entry] as const] : []));
  const sourceEntries = cycle.sourceEntryIds.map((id) => byId.get(id));
  return sourceEntries.every(Boolean) && sourceDigest(sourceEntries as SessionEntry[]) === cycle.sourceDigest;
}

export function sourceFactsDigest(cycles: CycleSourceFacts[]): string {
  return digestParts(cycles.map((cycle) => ({ cycleId: cycle.cycleId, sourceEntryIds: cycle.sourceEntryIds, sourceDigest: cycle.sourceDigest, factsDigest: cycle.factsDigest }))).slice(0, 32);
}

export const extractFacts = extractStructuredFacts;
export const extractCycleFacts = extractCycleSourceFacts;
