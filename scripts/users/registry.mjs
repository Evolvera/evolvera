// Registro único e não secreto de usuários (/usuario): identidade, raízes e admissões.
//
// CONTRATO PARA CONSUMERS
// - Nada é lido ou escrito ao importar. Todo caminho é explícito e absoluto; não há
//   perfil "ativo" global, variável de ambiente, HOME ou fallback implícito.
// - `registerUser(opts)`  -> contexto imutável. Opções: registryPath, id, label, agentDir,
//   sessionRoots?, workspaces?, contexts?, sharedAssets?, adoptExisting?, lockTimeoutMs?
//   (número finito >= 0, senão OPTION_INVALID). Idempotente para registro idêntico; id existente com dados diferentes
//   é USER_EXISTS. Nunca cria agentDir, nunca executa runtime, nunca abre auth/settings.
// - `resolveUser({registryPath, id})` -> contexto imutável com raízes canonicalizadas;
//   falha se o registro for malformado ou se alguma raiz virou alias/junction (ROOT_DRIFT).
// - Contexto: {id,label,agentDir,sessionRoots,workspaces,contexts,sharedAssets,adoption,
//   registryPath}. É congelado e emitido só por este módulo (WeakSet); objetos forjados ou
//   clonados por JSON são recusados (CONTEXT_INVALID). É um instantâneo: reresolva após
//   mudança do registro. `ownership.mjs` consome este contexto.
// - Regras: raízes precisam ser absolutas e iguais ao próprio realpath (alias/junction =
//   ROOT_ALIAS); raízes privadas (agentDir, sessionRoots, workspaces) de usuários distintos
//   nunca se igualam, contêm ou estão contidas (ROOT_CONFLICT). `sharedAssets` são código/
//   projeções não secretas somente-leitura: autoridade de asset NÃO é posse de credencial
//   (não autorizam workspace/sessão, e não podem sobrepor agentDir/sessionRoots nem citar
//   auth/settings/models/mcp/memory). `contexts` são marcadores ancestrais exatos admitidos.
// - Adoção de estado preexistente (agentDir não vazio, .pi/memory etc.) só é possível para
//   o dono legado "evolvera" com `adoptExisting: true` e é por referência: o conteúdo não é
//   aberto, copiado ou movido. Qualquer outro id recusa estado preexistente.
// - Escrita: exclusão mútua por diretório `<registry>.lock` (mkdir atômico, espera limitada)
//   + arquivo temporário fsync + rename atômico. Readers nunca veem JSON parcial. NÃO há roubo
//   nem recuperação automática de lock: um lock existente (inclusive velho/órfão) sempre termina
//   em REGISTRY_LOCK_TIMEOUT com o arquivo intacto, e só o holder que adquiriu o lock o remove.
//   Um lock órfão exige remoção manual explícita por quem opera o registro.
// - Identidade de arquivo: antes de abrir o registro, lstat recusa symlink e arquivo regular com
//   nlink > 1 (REGISTRY_ALIAS): outro caminho para o mesmo inode não prova estado distinto.
//   O conteúdo não é aberto nesse caso.
// - Erros são `UsersError` com `code` estável e mensagem fixa: nunca incluem caminhos de
//   outros usuários, conteúdo de arquivo ou valores secretos.
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

export const REGISTRY_VERSION = 1;
export const LEGACY_OWNER_ID = "evolvera";

const ID_RE = /^[a-z][a-z0-9-]{1,31}$/;
const LABEL_RE = /^[^\u0000-\u001f\u007f]{1,64}$/;
const MAX_REGISTRY_BYTES = 1024 * 1024;
const USER_KEYS = ["adoption", "agentDir", "contexts", "id", "label", "sessionRoots", "sharedAssets", "workspaces"];
const CREDENTIAL_SEGMENTS = new Set(["auth.json", "settings.json", "models.json", "mcp.json", "memory"]);
const STATE_MARKERS = [[".pi", "memory"], [".pi", "sessions"], [".pi", "settings.json"]];
const TRANSIENT_FS = new Set(["EPERM", "EBUSY", "EACCES"]);
const issued = new WeakSet();

export class UsersError extends Error {
  constructor(code, message) {
    super(message ? `${code}: ${message}` : code);
    this.name = "UsersError";
    this.code = code;
  }
}
const fail = (code, message) => new UsersError(code, message);

// ---- primitivas de caminho (compartilhadas com ownership.mjs) --------------------------
export function isWithin(parent, child) {
  const rel = path.relative(parent, child);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}
export const samePath = (a, b) => path.relative(a, b) === "";
const overlap = (a, b) => isWithin(a, b) || isWithin(b, a);

/** Realpath de um caminho absoluto, mesmo inexistente (ancestral existente + resto lexical). */
export function canonicalize(p) {
  if (typeof p !== "string" || p === "" || p.includes("\0") || !path.isAbsolute(p)) {
    throw fail("PATH_INVALID", "path must be a non-empty absolute string");
  }
  let current = path.resolve(p);
  const rest = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(current), ...rest.reverse());
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw fail("PATH_UNRESOLVABLE", "path cannot be resolved");
      try {
        fs.lstatSync(current); // existe mas realpath falhou: link pendente => indecidível
        throw fail("PATH_UNRESOLVABLE", "dangling link in path");
      } catch (inner) {
        if (inner instanceof UsersError) throw inner;
      }
      const parent = path.dirname(current);
      if (parent === current) throw fail("PATH_UNRESOLVABLE", "no existing ancestor");
      rest.push(path.basename(current));
      current = parent;
    }
  }
}

/** Raiz precisa ser igual ao próprio realpath: recusa alias, junction e symlink em qualquer componente. */
function strictRoot(p, field) {
  let canon;
  try { canon = canonicalize(p); } catch (error) { throw fail("ROOT_INVALID", `${field} is not a resolvable absolute path`); }
  if (!samePath(canon, path.resolve(p))) throw fail("ROOT_ALIAS", `${field} is an alias/junction or non-canonical path`);
  return canon;
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function retryFs(fn, attempts = 40) {
  for (let i = 0; ; i += 1) {
    try { return fn(); } catch (error) {
      if (!TRANSIENT_FS.has(error.code) || i >= attempts) throw error;
      sleep(Math.min(5 + i * 5, 50));
    }
  }
}

// ---- validação do registro -------------------------------------------------------------
const isAbs = (p) => typeof p === "string" && path.isAbsolute(p) && !p.includes("\0") && path.resolve(p) === p;
const absArray = (a) => Array.isArray(a) && a.every(isAbs);
const malformed = (why) => fail("REGISTRY_MALFORMED", why);

function validateUser(u) {
  if (!u || typeof u !== "object" || Array.isArray(u)) throw malformed("user entry is not an object");
  if (JSON.stringify(Object.keys(u).sort()) !== JSON.stringify(USER_KEYS)) throw malformed("user entry has unexpected keys");
  if (typeof u.id !== "string" || !ID_RE.test(u.id)) throw malformed("invalid user id");
  if (typeof u.label !== "string" || !LABEL_RE.test(u.label)) throw malformed("invalid label");
  if (u.adoption !== "reference" && u.adoption !== "new") throw malformed("invalid adoption");
  if (!isAbs(u.agentDir)) throw malformed("invalid agentDir");
  for (const key of ["sessionRoots", "workspaces", "contexts", "sharedAssets"]) {
    if (!absArray(u[key])) throw malformed(`invalid ${key}`);
  }
  if (u.sessionRoots.length === 0) throw malformed("sessionRoots is empty");
  return u;
}

const privateRoots = (u) => [u.agentDir, ...u.sessionRoots, ...u.workspaces];

/** Devolve descrição fixa (sem caminhos) do primeiro conflito, ou null. */
function findConflict(users, registryPath) {
  for (const u of users) {
    for (const w of u.workspaces) {
      for (const r of [u.agentDir, ...u.sessionRoots]) if (overlap(w, r)) return "workspace overlaps own agent/session roots";
    }
    for (const r of privateRoots(u)) if (overlap(r, registryPath)) return "root overlaps registry file";
    for (const o of users) {
      if (o === u) continue;
      for (const c of u.contexts) for (const r of privateRoots(o)) if (isWithin(r, c)) return "context inside another user's root";
    }
    for (const a of u.sharedAssets) {
      if (a.split(path.sep).some((seg) => CREDENTIAL_SEGMENTS.has(seg.toLowerCase()))) return "shared asset names a credential/memory path";
      for (const o of users) for (const r of [o.agentDir, ...o.sessionRoots]) if (overlap(a, r)) return "shared asset overlaps an account root";
    }
  }
  for (let i = 0; i < users.length; i += 1) {
    for (let j = i + 1; j < users.length; j += 1) {
      for (const a of privateRoots(users[i])) for (const b of privateRoots(users[j])) if (overlap(a, b)) return "roots overlap between users";
    }
  }
  return null;
}

function validateRegistry(data, registryPath) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw malformed("root is not an object");
  if (JSON.stringify(Object.keys(data).sort()) !== JSON.stringify(["users", "version"])) throw malformed("unexpected top-level keys");
  if (data.version !== REGISTRY_VERSION) throw malformed("unsupported version");
  if (!Array.isArray(data.users)) throw malformed("users is not an array");
  const ids = new Set();
  for (const u of data.users) {
    validateUser(u);
    if (ids.has(u.id)) throw malformed("duplicate user id");
    ids.add(u.id);
  }
  if (findConflict(data.users, registryPath)) throw malformed("conflicting roots");
  return data;
}

function canonRegistryPath(registryPath) {
  if (typeof registryPath !== "string" || !path.isAbsolute(registryPath)) throw fail("REGISTRY_PATH_INVALID", "registryPath must be an explicit absolute path");
  const dir = canonicalize(path.dirname(path.resolve(registryPath)));
  const base = path.basename(registryPath);
  if (!base || base === "." || base === "..") throw fail("REGISTRY_PATH_INVALID", "invalid registry path");
  const file = path.join(dir, base);
  try {
    if (fs.lstatSync(file).isSymbolicLink()) throw fail("REGISTRY_ALIAS", "registry file is a link");
  } catch (error) {
    if (error instanceof UsersError) throw error;
    if (error.code !== "ENOENT") throw fail("REGISTRY_UNREADABLE", "registry file cannot be inspected");
  }
  return file;
}

function readRegistry(file, { required }) {
  const missing = () => {
    if (required) throw fail("REGISTRY_MISSING", "registry file does not exist");
    return { version: REGISTRY_VERSION, users: [] };
  };
  // Metadados primeiro: nada do conteúdo é aberto para symlink, não-arquivo ou hardlink.
  let st;
  try { st = retryFs(() => fs.lstatSync(file)); } catch (error) {
    if (error.code === "ENOENT") return missing();
    throw fail("REGISTRY_UNREADABLE", "registry file cannot be inspected");
  }
  if (st.isSymbolicLink()) throw fail("REGISTRY_ALIAS", "registry file is a link");
  if (!st.isFile()) throw fail("REGISTRY_UNREADABLE", "registry path is not a regular file");
  if (st.nlink > 1) throw fail("REGISTRY_ALIAS", "registry file has multiple hard links");
  if (st.size > MAX_REGISTRY_BYTES) throw malformed("registry too large");
  let raw;
  try {
    raw = retryFs(() => fs.readFileSync(file));
  } catch (error) {
    if (error.code === "ENOENT") return missing();
    throw fail("REGISTRY_UNREADABLE", "registry file cannot be read");
  }
  if (raw.length > MAX_REGISTRY_BYTES) throw malformed("registry too large");
  let data;
  try { data = JSON.parse(raw.toString("utf8")); } catch { throw malformed("invalid JSON"); }
  return validateRegistry(data, file);
}

function writeRegistryAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  const fd = fs.openSync(tmp, "wx");
  try {
    fs.writeSync(fd, `${JSON.stringify(data, null, 2)}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    retryFs(() => fs.renameSync(tmp, file));
  } catch (error) {
    try { fs.unlinkSync(tmp); } catch { /* best effort: only our own tmp */ }
    throw error;
  }
}

function withLock(file, timeoutMs, fn) {
  const lockDir = `${file}.lock`;
  const deadline = Date.now() + timeoutMs;
  let delay = 5;
  for (;;) {
    try { fs.mkdirSync(lockDir); break; } catch (error) {
      if (error.code !== "EEXIST" && !TRANSIENT_FS.has(error.code)) throw error;
      if (Date.now() >= deadline) throw fail("REGISTRY_LOCK_TIMEOUT", "registry is locked by another writer");
      sleep(delay);
      delay = Math.min(delay * 2, 100);
    }
  }
  // Só chega aqui quem adquiriu o lock (mkdir bem-sucedido acima): nunca remove lock alheio.
  try { return fn(); } finally {
    try { fs.rmdirSync(lockDir); } catch { /* best effort: lock próprio */ }
  }
}

// ---- contexto imutável -----------------------------------------------------------------
function deepFreeze(value) {
  if (value && typeof value === "object") for (const v of Object.values(value)) deepFreeze(v);
  return Object.freeze(value);
}
function issue(record, registryPath) {
  const ctx = deepFreeze({
    id: record.id, label: record.label, agentDir: record.agentDir,
    sessionRoots: [...record.sessionRoots], workspaces: [...record.workspaces],
    contexts: [...record.contexts], sharedAssets: [...record.sharedAssets],
    adoption: record.adoption, registryPath,
  });
  issued.add(ctx);
  return ctx;
}
/** Recusa objetos que não foram emitidos por registerUser/resolveUser. */
export function requireContext(ctx) {
  if (!ctx || typeof ctx !== "object" || !issued.has(ctx)) throw fail("CONTEXT_INVALID", "context was not issued by the users registry");
  return ctx;
}

export const defaultRegistryPath = (homeDir) => {
  if (!isAbs(homeDir)) throw fail("PATH_INVALID", "homeDir must be an explicit absolute path");
  return path.join(homeDir, ".pi", "users", "registry.json");
};

const canonicalJson = (r) => JSON.stringify([
  r.id, r.label, r.adoption, r.agentDir, [...r.sessionRoots].sort(), [...r.workspaces].sort(),
  [...r.contexts].sort(), [...r.sharedAssets].sort(),
]);
const dedupe = (list) => [...new Map(list.map((p) => [process.platform === "win32" ? p.toLowerCase() : p, p])).values()];
const has = (p, ...parts) => {
  try { fs.lstatSync(path.join(p, ...parts)); return true; } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
    throw fail("STATE_UNDECIDABLE", "cannot decide whether pre-existing state exists");
  }
};

export function registerUser(opts = {}) {
  const { id, label, adoptExisting = false, lockTimeoutMs = 5000 } = opts;
  if (typeof id !== "string" || !ID_RE.test(id)) throw fail("USER_ID_INVALID", "id must match [a-z][a-z0-9-]{1,31}");
  if (typeof label !== "string" || !LABEL_RE.test(label)) throw fail("LABEL_INVALID", "label must be 1-64 printable characters");
  if (typeof adoptExisting !== "boolean") throw fail("OPTION_INVALID", "adoptExisting must be boolean");
  if (adoptExisting && id !== LEGACY_OWNER_ID) throw fail("ADOPTION_NOT_ALLOWED", "only the legacy owner can adopt pre-existing state");
  if (typeof lockTimeoutMs !== "number" || !Number.isFinite(lockTimeoutMs) || lockTimeoutMs < 0) throw fail("OPTION_INVALID", "lockTimeoutMs must be a finite non-negative number");
  for (const key of ["sessionRoots", "workspaces", "contexts", "sharedAssets"]) {
    if (opts[key] !== undefined && !Array.isArray(opts[key])) throw fail("OPTION_INVALID", `${key} must be an array`);
  }
  const file = canonRegistryPath(opts.registryPath);
  const agentDir = strictRoot(opts.agentDir, "agentDir");
  const roots = (key) => dedupe((opts[key] ?? []).map((p) => strictRoot(p, key)));
  const sessionRoots = dedupe((opts.sessionRoots?.length ? opts.sessionRoots : [path.join(agentDir, "sessions")])
    .map((p) => strictRoot(p, "sessionRoots")));
  const record = {
    id, label, agentDir, sessionRoots, workspaces: roots("workspaces"), contexts: roots("contexts"),
    sharedAssets: roots("sharedAssets"), adoption: adoptExisting ? "reference" : "new",
  };

  fs.mkdirSync(path.dirname(file), { recursive: true });
  return withLock(file, lockTimeoutMs, () => {
    const data = readRegistry(file, { required: false });
    const existing = data.users.find((u) => u.id === id);
    if (existing) {
      if (canonicalJson(existing) === canonicalJson(record)) return issue(existing, file);
      throw fail("USER_EXISTS", "user id already registered with different data");
    }
    const users = [...data.users, validateUser(record)];
    const conflict = findConflict(users, file);
    if (conflict) throw fail("ROOT_CONFLICT", conflict);
    if (!adoptExisting) {
      // Estado preexistente sem dono não é adotado: só nomes de entradas, nunca conteúdo.
      for (const root of dedupe([agentDir, ...sessionRoots])) {
        let entries = [];
        try { entries = fs.readdirSync(root); } catch (error) {
          if (error.code !== "ENOENT") throw fail("STATE_UNDECIDABLE", "agent/session root cannot be inspected");
        }
        if (entries.length > 0) throw fail("EXISTING_STATE_NOT_ADOPTED", "agent/session root already has state; adoption is not allowed for this user");
      }
      for (const w of record.workspaces) {
        if (STATE_MARKERS.some((m) => has(w, ...m))) throw fail("EXISTING_STATE_NOT_ADOPTED", "workspace already has unowned project state");
      }
    }
    writeRegistryAtomic(file, { version: REGISTRY_VERSION, users });
    return issue(record, file);
  });
}

/** List registered users through the same validated, read-only registry authority. */
export function listUsers(opts = {}) {
  const file = canonRegistryPath(opts.registryPath);
  const data = readRegistry(file, { required: false });
  return Object.freeze(data.users.map(({ id, label }) => Object.freeze({ id, label })));
}

export function resolveUser(opts = {}) {
  const { id } = opts;
  if (typeof id !== "string" || !ID_RE.test(id)) throw fail("USER_ID_INVALID", "id must match [a-z][a-z0-9-]{1,31}");
  const file = canonRegistryPath(opts.registryPath);
  const data = readRegistry(file, { required: true });
  const record = data.users.find((u) => u.id === id);
  if (!record) throw fail("USER_UNKNOWN", "user is not registered");
  // Deriva se alguma raiz virou alias/junction depois do cadastro.
  for (const p of privateRoots(record)) strictRootDrift(p);
  return issue(record, file);
}
function strictRootDrift(p) {
  let canon;
  try { canon = canonicalize(p); } catch { throw fail("ROOT_DRIFT", "registered root can no longer be resolved"); }
  if (!samePath(canon, p)) throw fail("ROOT_DRIFT", "registered root is now an alias/junction");
}
