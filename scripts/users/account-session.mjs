// Native-session account association. Importing this module performs no I/O.
import fs from "node:fs";
import path from "node:path";
import { listUsers, registerUser, resolveUser } from "./registry.mjs";

export const ACCOUNT_BINDING_TYPE = "pi.account";
const associations = new WeakMap();
const ID_RE = /^[a-z][a-z0-9-]{1,31}$/;
const fail = (code) => Object.assign(new Error(code), { code });

function sessionIdentity(manager) {
  const id = typeof manager.getSessionId === "function" ? manager.getSessionId() : manager.getHeader?.()?.id;
  if (typeof id !== "string" || id.length === 0) throw fail("ACCOUNT_SESSION_UNDECIDABLE");
  return id;
}

function hasConversation(entries) {
  return entries.some((entry) => entry?.type === "message" &&
    (entry.message?.role === "user" || entry.message?.role === "assistant"));
}

function entriesFor(manager) {
  if (!manager || typeof manager.getEntries !== "function") throw fail("ACCOUNT_SESSION_INVALID");
  const loadedEntries = manager.getEntries();
  if (!Array.isArray(loadedEntries)) throw fail("ACCOUNT_SESSION_UNDECIDABLE");
  const entries = [...loadedEntries];
  const sessionFile = typeof manager.getSessionFile === "function" ? manager.getSessionFile() : undefined;
  const persisted = typeof manager.isPersisted === "function" ? manager.isPersisted() : !!sessionFile;
  const sessionId = sessionIdentity(manager);
  if (persisted && !sessionFile) throw fail("ACCOUNT_SESSION_UNDECIDABLE");
  if (sessionFile) {
    let stat;
    try { stat = fs.lstatSync(sessionFile); } catch (error) {
      if (error.code !== "ENOENT") throw fail("ACCOUNT_SESSION_UNDECIDABLE");
      if (persisted && hasConversation(entries)) throw fail("ACCOUNT_SESSION_UNDECIDABLE");
    }
    if (stat) {
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) throw fail("ACCOUNT_SESSION_UNDECIDABLE");
      let raw;
      try { raw = fs.readFileSync(sessionFile, "utf8"); } catch { throw fail("ACCOUNT_SESSION_UNDECIDABLE"); }
      const parsed = [];
      for (const line of raw.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error();
          parsed.push(entry);
        } catch { throw fail("ACCOUNT_SESSION_UNDECIDABLE"); }
      }
      const headers = parsed.filter((entry) => entry.type === "session");
      if (headers.length !== 1 || headers[0].id !== sessionId ||
        (typeof manager.getHeader === "function" && manager.getHeader()?.id !== headers[0].id)) {
        throw fail("ACCOUNT_SESSION_UNDECIDABLE");
      }
      const rawEntries = parsed.filter((entry) => entry.type !== "session");
      if (bindingIn(rawEntries) !== bindingIn(entries)) throw fail("ACCOUNT_SESSION_UNDECIDABLE");
      return { entries: rawEntries, sessionFile, persisted, sessionId };
    }
  }
  return { entries, sessionFile, persisted, sessionId };
}

function bindingIn(entries) {
  const found = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") throw fail("ACCOUNT_SESSION_UNDECIDABLE");
    if (entry.customType !== ACCOUNT_BINDING_TYPE) continue;
    if (entry.type !== "custom") throw fail("ACCOUNT_BINDING_MALFORMED");
    const data = entry.data;
    if (!data || typeof data !== "object" || Array.isArray(data) ||
      Object.keys(data).sort().join(",") !== "accountId,version" || data.version !== 1 ||
      typeof data.accountId !== "string" || !ID_RE.test(data.accountId)) {
      throw fail("ACCOUNT_BINDING_MALFORMED");
    }
    found.push(data.accountId);
  }
  const unique = [...new Set(found)];
  if (unique.length > 1) throw fail("ACCOUNT_BINDING_CONFLICT");
  return unique[0];
}

function resolveBinding(registryPath, id) {
  try { return resolveUser({ registryPath, id }); }
  catch (error) {
    if (error?.code === "USER_UNKNOWN") throw fail("ACCOUNT_BINDING_UNKNOWN");
    throw error;
  }
}

function associate(manager, accountId, state = entriesFor(manager)) {
  associations.set(manager, Object.freeze({ accountId, sessionId: state.sessionId, sessionFile: state.sessionFile }));
}

function appendBinding(manager, accountId) {
  if (typeof manager.appendCustomEntry !== "function") throw fail("ACCOUNT_SESSION_UNSUPPORTED");
  manager.appendCustomEntry(ACCOUNT_BINDING_TYPE, { version: 1, accountId });
  associate(manager, accountId);
}

/** Inspect the native manager's complete persisted/session-entry history, not its active branch. */
export function inspectSessionBinding({ registryPath, sessionManager }) {
  const state = entriesFor(sessionManager);
  const id = bindingIn(state.entries);
  return id === undefined ? undefined : resolveBinding(registryPath, id);
}

/**
 * Select the account attached to the natively selected session, associating genuine legacy
 * sessions once. Only native new/fork replacement events may inherit an explicit predecessor.
 */
export async function selectSessionAccount({ registryPath, sessionManager, sessionStartEvent, predecessorSessionManager, pickAccount }) {
  const state = entriesFor(sessionManager);
  const foundId = bindingIn(state.entries);
  let predecessorId;
  const reason = sessionStartEvent?.type === "session_start" ? sessionStartEvent.reason : undefined;
  if ((reason === "new" || reason === "fork") && predecessorSessionManager && associations.has(predecessorSessionManager)) {
    const receipt = associations.get(predecessorSessionManager);
    if (predecessorSessionManager === sessionManager) {
      const sameSession = state.sessionId === receipt.sessionId;
      if (sameSession) {
        if (foundId !== receipt.accountId) throw fail("ACCOUNT_BINDING_CONFLICT");
      } else {
        if (sessionStartEvent.previousSessionFile !== receipt.sessionFile) throw fail("ACCOUNT_BINDING_CONFLICT");
        predecessorId = receipt.accountId;
      }
    } else {
      const predecessorState = entriesFor(predecessorSessionManager);
      if (predecessorState.sessionId !== receipt.sessionId || bindingIn(predecessorState.entries) !== receipt.accountId) {
        throw fail("ACCOUNT_BINDING_CONFLICT");
      }
      predecessorId = receipt.accountId;
    }
  }
  if (foundId !== undefined) {
    if (predecessorId !== undefined && predecessorId !== foundId) throw fail("ACCOUNT_BINDING_CONFLICT");
    const context = resolveBinding(registryPath, foundId);
    associate(sessionManager, foundId, state);
    return context;
  }

  let accountId = predecessorId;
  if (accountId === undefined) {
    if (typeof pickAccount !== "function") throw fail("ACCOUNT_SELECTION_REQUIRED");
    const selection = await pickAccount(Object.freeze(listUsers({ registryPath })));
    if (typeof selection !== "string" || !ID_RE.test(selection)) throw fail("ACCOUNT_SELECTION_CANCELLED");
    accountId = selection;
  }
  const context = resolveBinding(registryPath, accountId);
  // appendCustomEntry follows native deferred persistence: an empty fresh session remains in memory.
  appendBinding(sessionManager, context.id);
  return context;
}

/** Register a credentials-only account namespace through the existing registry authority. */
export function createAccount({ registryPath, id, label }) {
  if (typeof id !== "string" || !ID_RE.test(id)) throw fail("USER_ID_INVALID");
  if (typeof registryPath !== "string" || !path.isAbsolute(registryPath)) throw fail("REGISTRY_PATH_INVALID");
  const base = path.join(path.dirname(registryPath), "profiles", id);
  const agentDir = path.join(base, ".pi", "agent");
  const sessionRoot = path.join(agentDir, "sessions");
  const context = registerUser({
    registryPath, id, label: label ?? id, agentDir, sessionRoots: [sessionRoot],
    workspaces: [], contexts: [], sharedAssets: [],
  });
  fs.mkdirSync(agentDir, { recursive: true });
  return context;
}
