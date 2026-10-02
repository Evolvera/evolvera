// Propriedade de workspace e sessão por realpath, sobre contextos emitidos por registry.mjs.
//
// CONTRATO PARA CONSUMERS
// - `assertOwnedWorkspace(ctx, cwd, opts?)` -> {userId, cwd, workspaceRoot, worktreeOrigin}
//   (congelado) ou UsersError. `cwd` precisa ser absoluto, existente, igual ao próprio
//   realpath (alias/junction = WORKSPACE_ALIAS) e estar dentro de um `ctx.workspaces`.
//   Também verifica, sem abrir conteúdo: marcadores `.pi`, `.pi/memory`, `.agents`,
//   `AGENTS.md`, `CLAUDE.md` de cwd até a raiz — o destino realpath precisa estar em
//   workspaces/sharedAssets do usuário ou ser um `ctx.contexts` admitido exato (senão
//   RESOURCE_ESCAPES_OWNER / ANCESTOR_CONTEXT_UNADMITTED); e a origem de worktree
//   (`.git` arquivo com `gitdir:`) precisa pertencer ao usuário (WORKTREE_ORIGIN_ALIEN).
//   Origem de worktree vinculado, por leituras explícitas e limitadas de metadados (sem processo
//   git): `.git` arquivo -> `gitdir:` (precisa estar em workspace do usuário ANTES de qualquer
//   leitura ali, e ser canônico sem alias) -> `<gitdir>/commondir` (arquivo regular, nlink 1, ≤4 KiB;
//   o diretório comum resolvido precisa ser `.git` canônico em workspace do usuário e
//   `<gitdir>` precisa ser `<comum>/worktrees/<nome>`). Metadado ausente/desconhecido (inclusive
//   submódulo, `--separate-git-dir`, repositório bare) = WORKTREE_ORIGIN_UNDECIDABLE; nunca se
//   adivinha a origem pelo texto do caminho. Alias (symlink/junction, hardlink) de `.git`,
//   `commondir`, gitdir ou diretório comum = WORKTREE_ALIAS. `.git` diretório normal mantém o
//   comportamento anterior (a origem é o próprio diretório).
//   `opts.ancestorLimit` (absoluto) limita a subida dos marcadores — só para fixtures/jaulas;
//   produção omite e a subida vai até a raiz do volume.
// - `assertOwnedSession(ctx, {sessionPath, cwd?}, opts?)` -> {userId, sessionPath,
//   sessionRoot, exists, workspace}. Ordem: (1) caminho canônico dentro de `ctx.sessionRoots`
//   sem abrir o arquivo; (2) `cwd` informado é workspace do usuário; (3) se o arquivo existe,
//   somente a primeira linha (header JSONL, ≤64 KiB) é lida e seu `cwd` deve ser workspace
//   do usuário (SESSION_HEADER_CWD_UNOWNED); arquivo novo exige `cwd`. Nada é reformado.
//   Arquivo de sessão existente com nlink > 1 é SESSION_ALIAS, decidido por metadados antes de
//   abrir o conteúdo (outro caminho para o mesmo inode não prova estado distinto).
// - Posse de workspace/sessão nunca decorre de `sharedAssets`. Mensagens de erro não trazem
//   caminhos nem conteúdo. Não é sandbox de SO: é uma checagem de política antes de ler/abrir.
import fs from "node:fs";
import path from "node:path";
import { UsersError, canonicalize, isWithin, requireContext, samePath } from "./registry.mjs";

const MARKERS = [[".pi"], [".pi", "memory"], [".agents"], ["AGENTS.md"], ["CLAUDE.md"]];
const MAX_HEADER_BYTES = 64 * 1024;
const MAX_META_BYTES = 4096;
const GIT_UNDECIDABLE = "WORKTREE_ORIGIN_UNDECIDABLE";
const fail = (code, message) => new UsersError(code, message);
const frozen = (value) => Object.freeze(value);

function lstatOrNull(p) {
  try { return fs.lstatSync(p); } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw fail("OWNERSHIP_UNDECIDABLE", "filesystem entry cannot be inspected");
  }
}
function realOrFail(p) {
  try { return fs.realpathSync.native(p); } catch { throw fail("OWNERSHIP_UNDECIDABLE", "filesystem entry cannot be resolved"); }
}
const ownedRoots = (ctx) => [...ctx.workspaces, ...ctx.sharedAssets];

function checkMarkers(ctx, cwd, ancestorLimit) {
  let limit = null;
  if (ancestorLimit !== undefined) {
    limit = canonicalize(ancestorLimit);
    if (!isWithin(limit, cwd)) throw fail("OPTION_INVALID", "ancestorLimit must contain cwd");
  }
  for (let dir = cwd; ; dir = path.dirname(dir)) {
    const insideWorkspace = ctx.workspaces.some((w) => isWithin(w, dir));
    for (const marker of MARKERS) {
      const entry = path.join(dir, ...marker);
      if (!lstatOrNull(entry)) continue;
      const target = realOrFail(entry);
      const allowed = ownedRoots(ctx).some((r) => isWithin(r, target)) || ctx.contexts.some((c) => samePath(c, target));
      if (!allowed) throw fail(insideWorkspace ? "RESOURCE_ESCAPES_OWNER" : "ANCESTOR_CONTEXT_UNADMITTED", "project resource is outside the user's admitted roots");
    }
    if ((limit && samePath(limit, dir)) || path.dirname(dir) === dir) return;
  }
}

/** Lê um arquivo pequeno de metadados do Git. lstat antes de abrir: link/hardlink/não-regular nunca são abertos. */
function readMetaFile(file, what) {
  const st = lstatOrNull(file);
  if (!st) throw fail(GIT_UNDECIDABLE, `${what} is missing`);
  if (st.isSymbolicLink()) throw fail("WORKTREE_ALIAS", `${what} is a link`);
  if (!st.isFile()) throw fail(GIT_UNDECIDABLE, `${what} is not a regular file`);
  if (st.nlink > 1) throw fail("WORKTREE_ALIAS", `${what} has multiple hard links`);
  let text;
  let n;
  try {
    const fd = fs.openSync(file, "r");
    try {
      const buf = Buffer.alloc(MAX_META_BYTES);
      n = fs.readSync(fd, buf, 0, MAX_META_BYTES, 0);
      text = buf.toString("utf8", 0, n);
    } finally { fs.closeSync(fd); }
  } catch { throw fail(GIT_UNDECIDABLE, `${what} cannot be read`); }
  if (n >= MAX_META_BYTES) throw fail(GIT_UNDECIDABLE, `${what} is too large`);
  return text;
}

const inWorkspace = (ctx, p) => ctx.workspaces.some((w) => isWithin(w, p));

/**
 * Diretório de metadados apontado por ponteiro: precisa ser do usuário (checado antes de ler
 * qualquer coisa dentro dele), existente como diretório e canônico (sem alias em nenhum componente).
 */
function metaDir(ctx, lexical, what) {
  let canon;
  try { canon = canonicalize(lexical); } catch { throw fail(GIT_UNDECIDABLE, `${what} cannot be resolved`); }
  if (!inWorkspace(ctx, canon)) throw fail("WORKTREE_ORIGIN_ALIEN", "worktree origin belongs to another owner");
  if (!samePath(canon, lexical)) throw fail("WORKTREE_ALIAS", `${what} is an alias/junction or non-canonical path`);
  const st = lstatOrNull(canon);
  if (!st) throw fail(GIT_UNDECIDABLE, `${what} does not exist`);
  if (!st.isDirectory()) throw fail(GIT_UNDECIDABLE, `${what} is not a directory`);
  return canon;
}

function worktreeOrigin(ctx, cwd, workspaceRoot) {
  for (let dir = cwd; ; dir = path.dirname(dir)) {
    const git = path.join(dir, ".git");
    const st = lstatOrNull(git);
    if (st) {
      if (st.isSymbolicLink()) throw fail("WORKTREE_ALIAS", ".git entry is a link/junction");
      if (st.isDirectory()) return dir;
      if (!st.isFile()) throw fail(GIT_UNDECIDABLE, ".git entry is not a file or directory");
      const match = /^gitdir:\s*(.+?)\s*$/m.exec(readMetaFile(git, ".git file"));
      if (!match) throw fail(GIT_UNDECIDABLE, ".git file has no gitdir pointer");
      const gitdir = metaDir(ctx, path.resolve(dir, match[1]), "gitdir");
      const pointer = readMetaFile(path.join(gitdir, "commondir"), "commondir file").split(/\r?\n/, 1)[0].trim();
      if (!pointer || pointer.includes("\0")) throw fail(GIT_UNDECIDABLE, "commondir file is empty");
      const common = metaDir(ctx, path.resolve(gitdir, pointer), "common git dir");
      if (path.basename(common).toLowerCase() !== ".git") throw fail(GIT_UNDECIDABLE, "common git dir is not a .git directory");
      if (!samePath(path.dirname(gitdir), path.join(common, "worktrees"))) throw fail(GIT_UNDECIDABLE, "gitdir is not a linked worktree of its common dir");
      const origin = path.dirname(common);
      if (!inWorkspace(ctx, origin)) throw fail("WORKTREE_ORIGIN_ALIEN", "worktree origin belongs to another owner");
      return origin;
    }
    if (samePath(dir, workspaceRoot) || path.dirname(dir) === dir) return null;
  }
}

export function assertOwnedWorkspace(ctx, cwd, opts = {}) {
  requireContext(ctx);
  let real;
  try { real = canonicalize(cwd); } catch { throw fail("WORKSPACE_INVALID", "cwd is not a resolvable absolute path"); }
  if (!samePath(real, path.resolve(cwd))) throw fail("WORKSPACE_ALIAS", "cwd is an alias/junction or non-canonical path");
  let stat;
  try { stat = fs.statSync(real); } catch { throw fail("WORKSPACE_INVALID", "cwd does not exist"); }
  if (!stat.isDirectory()) throw fail("WORKSPACE_INVALID", "cwd is not a directory");
  const workspaceRoot = ctx.workspaces.find((w) => isWithin(w, real));
  if (!workspaceRoot) throw fail("WORKSPACE_NOT_OWNED", "cwd is not inside a workspace owned by this user");
  checkMarkers(ctx, real, opts.ancestorLimit);
  return frozen({ userId: ctx.id, cwd: real, workspaceRoot, worktreeOrigin: worktreeOrigin(ctx, real, workspaceRoot) });
}

function readHeaderCwd(file) {
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(MAX_HEADER_BYTES);
    const n = fs.readSync(fd, buf, 0, MAX_HEADER_BYTES, 0);
    const end = buf.subarray(0, n).indexOf(0x0a);
    if (end === -1 && n === MAX_HEADER_BYTES) throw new Error("header too long");
    const header = JSON.parse(buf.toString("utf8", 0, end === -1 ? n : end).replace(/\r$/, ""));
    if (!header || header.type !== "session" || typeof header.cwd !== "string") throw new Error("not a session header");
    return header.cwd;
  } finally { fs.closeSync(fd); }
}

export function assertOwnedSession(ctx, request = {}, opts = {}) {
  requireContext(ctx);
  const { sessionPath, cwd } = request;
  let real;
  try { real = canonicalize(sessionPath); } catch { throw fail("SESSION_INVALID", "sessionPath is not a resolvable absolute path"); }
  if (!samePath(real, path.resolve(sessionPath))) throw fail("SESSION_ALIAS", "sessionPath is an alias/junction or non-canonical path");
  const sessionRoot = ctx.sessionRoots.find((r) => isWithin(r, real) && !samePath(r, real));
  if (!sessionRoot) throw fail("SESSION_NOT_OWNED", "session is not inside a session root owned by this user");
  const workspace = cwd === undefined ? null : assertOwnedWorkspace(ctx, cwd, opts);
  const st = lstatOrNull(real);
  if (st && !st.isFile()) throw fail("SESSION_INVALID", "session path is not a regular file");
  // Metadados antes do conteúdo: um segundo caminho para o mesmo inode não prova estado distinto.
  if (st && st.nlink > 1) throw fail("SESSION_ALIAS", "session file has multiple hard links");
  if (!st) {
    if (!workspace) throw fail("SESSION_CWD_REQUIRED", "a new session requires an owned cwd");
    return frozen({ userId: ctx.id, sessionPath: real, sessionRoot, exists: false, workspace });
  }
  let headerCwd;
  try { headerCwd = readHeaderCwd(real); } catch { throw fail("SESSION_HEADER_INVALID", "session header is missing or malformed"); }
  let headerWorkspace;
  try { headerWorkspace = assertOwnedWorkspace(ctx, headerCwd, opts); } catch { throw fail("SESSION_HEADER_CWD_UNOWNED", "session header cwd is not owned by this user"); }
  return frozen({ userId: ctx.id, sessionPath: real, sessionRoot, exists: true, workspace: workspace ?? headerWorkspace });
}
