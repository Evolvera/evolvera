import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { requireContext } from "./registry.mjs";
import { normalizeAlibabaAuthRecords } from "../compat/alibaba-users.mjs";

const CORE = "C:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent";
const LOCK_VERSION = "4.1.2";
const MAX_BYTES = 16 * 1024 * 1024;
const fail = (code) => Object.assign(new Error(code), { code });

function lockLibrary(sdkRoot) {
  const sdkRequire = createRequire(path.join(sdkRoot, "package.json"));
  const packagePath = sdkRequire.resolve("proper-lockfile/package.json");
  const expectedPath = path.join(fs.realpathSync.native(sdkRoot), "node_modules", "proper-lockfile", "package.json");
  if (path.resolve(packagePath) !== path.resolve(expectedPath)) throw fail("CREDENTIAL_LOCK_DEPENDENCY_INVALID");
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(packagePath, "utf8")); } catch { throw fail("CREDENTIAL_LOCK_DEPENDENCY_INVALID"); }
  if (manifest.name !== "proper-lockfile" || manifest.version !== LOCK_VERSION) throw fail("CREDENTIAL_LOCK_DEPENDENCY_INVALID");
  return sdkRequire("proper-lockfile");
}
const aborted = (signal) => signal?.aborted === true;
function checkAbort(signal) { if (aborted(signal)) throw fail("CREDENTIAL_ABORTED"); }
function delay(ms, signal) {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() { signal?.removeEventListener("abort", cancel); resolve(); }
    function cancel() { clearTimeout(timer); signal.removeEventListener("abort", cancel); reject(fail("CREDENTIAL_ABORTED")); }
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

function checkedPaths(agentDir, authPath) {
  const actualDir = fs.realpathSync.native(agentDir);
  if (path.resolve(agentDir) !== actualDir || !fs.statSync(actualDir).isDirectory()) throw fail("CREDENTIAL_PROFILE_IDENTITY");
  if (path.dirname(authPath) !== actualDir) throw fail("CREDENTIAL_FILE_IDENTITY");
  return { actualDir, authPath };
}
function inspectFile(paths, allowMissing) {
  const { actualDir, authPath } = paths;
  if (fs.realpathSync.native(path.dirname(authPath)) !== actualDir) throw fail("CREDENTIAL_PROFILE_IDENTITY");
  let st;
  try { st = fs.lstatSync(authPath); } catch (error) {
    if (error.code === "ENOENT" && allowMissing) return undefined;
    if (error.code === "ENOENT") return undefined;
    throw fail("CREDENTIAL_FILE_UNREADABLE");
  }
  if (st.isSymbolicLink() || !st.isFile() || st.nlink !== 1) throw fail("CREDENTIAL_FILE_ALIAS");
  if (fs.realpathSync.native(authPath) !== authPath) throw fail("CREDENTIAL_FILE_ALIAS");
  if (st.size > MAX_BYTES) throw fail("CREDENTIAL_FILE_MALFORMED");
  return st;
}
function parseRecords(bytes) {
  let value;
  try { value = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, "")); } catch { throw fail("CREDENTIAL_FILE_MALFORMED"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw fail("CREDENTIAL_FILE_MALFORMED");
  return value;
}
function readRaw(paths) {
  const before = inspectFile(paths, true);
  if (!before) return {};
  let bytes;
  try { bytes = fs.readFileSync(paths.authPath); } catch { throw fail("CREDENTIAL_FILE_UNREADABLE"); }
  const after = inspectFile(paths, false);
  if (!after || before.dev !== after.dev || before.ino !== after.ino || after.nlink !== 1) throw fail("CREDENTIAL_FILE_IDENTITY");
  if (bytes.length > MAX_BYTES) throw fail("CREDENTIAL_FILE_MALFORMED");
  return parseRecords(bytes);
}
const clone = (value) => value === undefined ? undefined : structuredClone(value);
const stable = (value) => JSON.stringify(value);
function isCredential(value) {
  return value && typeof value === "object" && !Array.isArray(value) && (value.type === "api_key" || value.type === "oauth");
}
function validateCredential(value) {
  if (!isCredential(value) ||
      (value.type === "api_key" && (value.key !== undefined && typeof value.key !== "string" || value.env !== undefined && (!value.env || typeof value.env !== "object" || Array.isArray(value.env) || !Object.values(value.env).every((entry) => typeof entry === "string")))) ||
      (value.type === "oauth" && (typeof value.access !== "string" || typeof value.refresh !== "string" || !Number.isFinite(value.expires)))) {
    throw fail("CREDENTIAL_VALUE_INVALID");
  }
}
function rejectLegacyMutation(raw, projected) {
  if (stable(raw) !== stable(projected)) throw fail("CREDENTIAL_LEGACY_MUTATION_BLOCKED");
}
function serialize(records) { return `${JSON.stringify(records, null, 2)}\n`; }

/** Bind the public CredentialStore protocol to the registry-issued profile's sole auth.json. */
export function createUserCredentialStore(context, { lockTimeoutMs = 10_000, sdkRoot = CORE } = {}) {
  const profile = requireContext(context);
  if (!Number.isFinite(lockTimeoutMs) || lockTimeoutMs < 0) throw fail("CREDENTIAL_OPTION_INVALID");
  const authPath = path.join(profile.agentDir, "auth.json");
  const paths = checkedPaths(profile.agentDir, authPath);
  const directoryStat = fs.statSync(paths.actualDir);
  const lockfile = lockLibrary(sdkRoot);
  function revalidate() {
    requireContext(context);
    checkedPaths(profile.agentDir, authPath);
    const current = fs.statSync(paths.actualDir);
    if (current.dev !== directoryStat.dev || current.ino !== directoryStat.ino) throw fail("CREDENTIAL_PROFILE_IDENTITY");
    inspectFile(paths, true);
  }
  const own = (records, id) => Object.hasOwn(records, id) ? records[id] : undefined;
  let tail = Promise.resolve();
  // Native availability probes can arrive in bursts. Keep this store FIFO so newer
  // probes cannot starve a request; the file lock still serializes other processes.
  async function enqueue(signal, operation) {
    checkAbort(signal);
    return new Promise((resolve, reject) => {
      let started = false;
      const cancel = () => { if (!started) reject(fail("CREDENTIAL_ABORTED")); };
      signal?.addEventListener("abort", cancel, { once: true });
      const job = tail.then(async () => {
        started = true;
        signal?.removeEventListener("abort", cancel);
        checkAbort(signal);
        return operation();
      });
      tail = job.then(() => undefined, () => undefined);
      job.then(resolve, reject);
    });
  }

  async function acquire(signal) {
    const deadline = Date.now() + lockTimeoutMs;
    for (;;) {
      checkAbort(signal);
      revalidate();
      try {
        let compromised;
        let identity;
        const lockPath = `${authPath}.lock`;
        const sameLock = () => {
          try {
            const st = fs.lstatSync(lockPath);
            return !st.isSymbolicLink() && st.isDirectory() && st.dev === identity.dev && st.ino === identity.ino && st.birthtimeMs === identity.birthtimeMs;
          } catch { return false; }
        };
        // Library release/exit cleanup must never remove a replacement owner's lock.
        const lockFs = Object.create(fs);
        lockFs.rmdir = (target, callback) => {
          if (identity && !sameLock()) return callback(fail("CREDENTIAL_LOCK_COMPROMISED"));
          fs.rmdir(target, callback);
        };
        lockFs.rmdirSync = (target) => {
          if (identity && !sameLock()) throw fail("CREDENTIAL_LOCK_COMPROMISED");
          return fs.rmdirSync(target);
        };
        const release = await lockfile.lock(authPath, {
          realpath: false,
          retries: 0,
          stale: 30_000,
          update: 15_000,
          fs: lockFs,
          onCompromised(error) { compromised = error || fail("CREDENTIAL_LOCK_COMPROMISED"); },
        });
        identity = fs.lstatSync(lockPath);
        return { release, isCompromised: () => compromised !== undefined || !sameLock() };
      } catch (error) {
        if (error?.code !== "ELOCKED") throw fail("CREDENTIAL_LOCK_FAILED");
        if (Date.now() >= deadline) throw fail("CREDENTIAL_LOCK_TIMEOUT");
        await delay(Math.min(25, Math.max(1, deadline - Date.now())), signal);
      }
    }
  }
  function view(raw) { return normalizeAlibabaAuthRecords(raw); }
  function validateProviderId(providerId) {
    if (typeof providerId !== "string" || providerId.length === 0) throw fail("CREDENTIAL_PROVIDER_INVALID");
  }
  function commit(next, previousStat) {
    inspectFile(paths, true);
    if (previousStat) {
      const current = inspectFile(paths, false);
      if (!current || current.dev !== previousStat.dev || current.ino !== previousStat.ino) throw fail("CREDENTIAL_FILE_IDENTITY");
    }
    const fd = fs.openSync(authPath, previousStat ? "w" : "wx", 0o600);
    try { fs.writeFileSync(fd, serialize(next), "utf8"); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    inspectFile(paths, false);
  }
  async function mutate(providerId, operation, fn, options) {
    validateProviderId(providerId);
    revalidate();
    checkAbort(options?.signal);
    const locked = await acquire(options?.signal);
    let operationError;
    try {
      checkAbort(options?.signal);
      revalidate();
      const beforeStat = inspectFile(paths, true);
      const raw = readRaw(paths);
      const projected = view(raw);
      if (providerId.startsWith("alibaba")) rejectLegacyMutation(raw, projected);
      checkAbort(options?.signal);
      let next = Object.assign(Object.create(null), raw);
      if (operation === "modify") {
        const result = await fn(clone(own(projected, providerId)));
        revalidate();
        checkAbort(options?.signal);
        if (locked.isCompromised()) throw fail("CREDENTIAL_LOCK_COMPROMISED");
        if (result === undefined) return clone(own(projected, providerId));
        validateCredential(result);
        next[providerId] = clone(result);
      } else {
        if (!Object.hasOwn(projected, providerId)) return;
        delete next[providerId];
      }
      checkAbort(options?.signal);
      if (locked.isCompromised()) throw fail("CREDENTIAL_LOCK_COMPROMISED");
      revalidate();
      commit(next, beforeStat);
      return operation === "modify" ? clone(next[providerId]) : undefined;
    } catch (error) {
      operationError = error;
      throw error;
    } finally {
      try { await locked.release(); }
      catch { if (!operationError) throw fail("CREDENTIAL_LOCK_RELEASE_FAILED"); }
    }
  }

  async function readLocked(options, fn) {
    revalidate();
    checkAbort(options.signal);
    const locked = await acquire(options.signal);
    let operationError;
    try {
      revalidate();
      checkAbort(options.signal);
      const result = fn(view(readRaw(paths)));
      revalidate();
      checkAbort(options.signal);
      if (locked.isCompromised()) throw fail("CREDENTIAL_LOCK_COMPROMISED");
      return result;
    } catch (error) { operationError = error; throw error; }
    finally {
      try { await locked.release(); }
      catch { if (!operationError) throw fail("CREDENTIAL_LOCK_RELEASE_FAILED"); }
    }
  }
  function readCredential(records, providerId) {
    const credential = clone(own(records, providerId));
    if (!isCredential(credential)) return undefined;
    validateCredential(credential);
    if (credential.type === "api_key" && credential.key && !credential.key.startsWith("!")) {
      let missing = false;
      credential.key = credential.key.replace(/\$(\$|!|\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*)/g, (_, token) => {
        if (token === "$" || token === "!") return token;
        const name = token.startsWith("{") ? token.slice(1, -1) : token;
        const value = (Object.hasOwn(credential.env || {}, name) && credential.env[name]) || process.env[name];
        if (!value) missing = true;
        return value || "";
      });
      if (missing) credential.key = undefined;
    }
    return credential;
  }
  return Object.freeze({
    async read(providerId, options = {}) {
      validateProviderId(providerId);
      return enqueue(options.signal, () => readLocked(options, (records) => readCredential(records, providerId)));
    },
    async list(options = {}) {
      return enqueue(options.signal, () => readLocked(options, (records) => Object.entries(records).filter(([, credential]) => isCredential(credential))
        .map(([providerId, credential]) => ({ providerId, type: credential.type }))));
    },
    modify(providerId, fn, options = {}) {
      if (typeof fn !== "function") return Promise.reject(fail("CREDENTIAL_CALLBACK_INVALID"));
      return enqueue(options.signal, () => mutate(providerId, "modify", fn, options));
    },
    delete(providerId, options = {}) { return enqueue(options.signal, () => mutate(providerId, "delete", undefined, options)); },
  });
}
