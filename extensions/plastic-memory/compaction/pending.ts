import { digestParts } from "../common/safety.ts";
import type { SessionBinding } from "../session/types.ts";

export const PENDING_TTL_MS = 300_000;
export type PendingCutIdentity = Readonly<{
  firstKeptEntryId: string;
  cutDigest: string;
  detailsDigest: string;
  summaryHeader: string;
}>;
export type PendingCompaction = Readonly<{
  slotId: string;
  binding: SessionBinding;
  runtimeToken: string;
  preparedPrefixIds: string[];
  preparedPrefixDigest: string;
  latestCompactionIdentity?: string;
  cut: PendingCutIdentity;
  stateDigest: string;
  stagedAt: number;
  expiresAt: number;
  consumed: boolean;
}>;
export type PendingBranch = Readonly<{
  binding: SessionBinding;
  runtimeToken: string;
  branchIds: string[];
  latestCompactionIdentity?: string;
}>;

function validNow(now: number): boolean { return Number.isFinite(now) && now >= 0; }
function branchDigest(ids: string[]): string { return digestParts(ids).slice(0, 32); }
function sameBinding(a: SessionBinding, b: SessionBinding): boolean {
  return a.sessionId === b.sessionId && a.generation === b.generation && a.branchId === b.branchId;
}
function nonEmptyStrings(value: unknown): value is string[] { return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.length > 0); }

export function makePendingCompaction(input: {
  slotId: string;
  binding: SessionBinding;
  runtimeToken: string;
  preparedPrefixIds: string[];
  latestCompactionIdentity?: string;
  cut: PendingCutIdentity;
  stateDigest: string;
  now?: number;
}): PendingCompaction {
  const now = input.now ?? Date.now();
  if (!validNow(now) || !Number.isSafeInteger(now)) throw new Error("pending timestamp is invalid");
  if (!input.slotId || !input.runtimeToken || !nonEmptyStrings(input.preparedPrefixIds)) throw new Error("pending identity is incomplete");
  if (!input.stateDigest || !input.cut.firstKeptEntryId || !input.cut.cutDigest || !input.cut.detailsDigest || !input.cut.summaryHeader) throw new Error("pending cut identity is incomplete");
  const preparedPrefixIds = [...input.preparedPrefixIds];
  return Object.freeze({
    slotId: input.slotId,
    binding: { ...input.binding },
    runtimeToken: input.runtimeToken,
    preparedPrefixIds,
    preparedPrefixDigest: branchDigest(preparedPrefixIds),
    ...(input.latestCompactionIdentity ? { latestCompactionIdentity: input.latestCompactionIdentity } : {}),
    cut: { ...input.cut },
    stateDigest: input.stateDigest,
    stagedAt: now,
    expiresAt: now + PENDING_TTL_MS,
    consumed: false,
  });
}

export function pendingBranchDigest(branchIds: string[]): string { return branchDigest(branchIds); }

/**
 * Identity/branch validation shared by both lifecycle stages, WITHOUT the
 * `consumed` flag: a pending is consumed at `session_before_compact` and only
 * acknowledged one hook later at `session_compact`, so acknowledgement must be
 * able to re-validate identity on an already-consumed pending.
 */
export function isPendingIdentityCurrent(pending: PendingCompaction | undefined, current: PendingBranch, now = Date.now()): boolean {
  if (!pending || !validNow(now) || now >= pending.expiresAt) return false;
  if (!sameBinding(pending.binding, current.binding) || pending.runtimeToken !== current.runtimeToken) return false;
  if (pending.latestCompactionIdentity !== current.latestCompactionIdentity) return false;
  if (!nonEmptyStrings(current.branchIds) || current.branchIds.length < pending.preparedPrefixIds.length) return false;
  if (pending.preparedPrefixIds.some((id, index) => current.branchIds[index] !== id)) return false;
  // The prefix is immutable; descendants may only be appended in the host's order.
  return branchDigest(current.branchIds.slice(0, pending.preparedPrefixIds.length)) === pending.preparedPrefixDigest;
}

/** Staging/consumption path: identity must be current AND the slot still unconsumed. */
export function isPendingUsable(pending: PendingCompaction | undefined, current: PendingBranch, now = Date.now()): boolean {
  return !!pending && !pending.consumed && isPendingIdentityCurrent(pending, current, now);
}

export function consumePending(pending: PendingCompaction | undefined, current: PendingBranch, now = Date.now()): PendingCompaction | undefined {
  if (!isPendingUsable(pending, current, now)) return undefined;
  return Object.freeze({ ...pending, consumed: true });
}

export class PendingStore {
  private slot: PendingCompaction | undefined;
  stage(pending: PendingCompaction): PendingCompaction {
    this.slot = pending;
    return pending;
  }
  peek(now = Date.now()): PendingCompaction | undefined {
    if (this.slot && now >= this.slot.expiresAt) this.slot = undefined;
    return this.slot;
  }
  consume(current: PendingBranch, now = Date.now()): PendingCompaction | undefined {
    const consumed = consumePending(this.peek(now), current, now);
    if (consumed) this.slot = undefined;
    else if (this.slot && !isPendingUsable(this.slot, current, now)) this.slot = undefined;
    return consumed;
  }
  clear(): void { this.slot = undefined; }
}

export function createPendingStore(): PendingStore { return new PendingStore(); }
export function stagePending(store: PendingStore, pending: PendingCompaction): PendingCompaction { return store.stage(pending); }
