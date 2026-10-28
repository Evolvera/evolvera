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
//   git), em ponteiros recíprocos: `.git` arquivo -> `gitdir:` (precisa estar em workspace do
//   usuário ANTES de qualquer leitura ali, e ser canônico sem alias) -> `<gitdir>/commondir` (o
//   diretório comum resolvido precisa ser `.git` canônico em workspace do usuário e `<gitdir>`
//   precisa ser `<comum>/worktrees/<nome>`) -> `<gitdir>/gitdir` (backlink ABSOLUTO que precisa
//   coincidir exatamente com a `.git` do worktree; cópia/forja de `.git` não coincide). Cada
//   arquivo: regular, nlink 1, ≤4 KiB, uma linha sem NUL, identidade conferida no descritor aberto.
//   Metadado ausente/desconhecido/divergente (inclusive submódulo, `--separate-git-dir`, bare) =
//   WORKTREE_ORIGIN_UNDECIDABLE; nunca se adivinha a origem pelo texto ou prefixo do caminho
//   (tmp inclusive). Alias (symlink/junction, hardlink) de `.git`, `commondir`, backlink, gitdir ou
//   diretório comum = WORKTREE_ALIAS. `.git` diretório normal mantém o comportamento anterior.
//   Um cwd FORA de todo `ctx.workspaces` só é aceito se a subida achar um `.git` arquivo cuja
//   linhagem recíproca acima fecha em origem registrada (worktree temporário do pi-subagents,
//   cwd na raiz ou em subdiretório): `workspaceRoot` é então a raiz desse worktree, nada é
//   cadastrado e os marcadores usam essa raiz + as admissões estáticas do usuário. Um `.git`
//   diretório ou a ausência de `.git` fora dos roots = WORKSPACE_NOT_OWNED.
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

function checkMarkers(ctx, cwd, ancestorLimit, derivedRoot = null) {
  let limit = null;
  if (ancestorLimit !== undefined) {
    limit = canonicalize(ancestorLimit);
    if (!isWithin(limit, cwd)) throw fail("OPTION_INVALID", "ancestorLimit must contain cwd");
  }
  const workspaceRoots = derivedRoot ? [...ctx.workspaces, derivedRoot] : ctx.workspaces;
  const admitted = derivedRoot ? [...ownedRoots(ctx), derivedRoot] : ownedRoots(ctx);
  for (let dir = cwd; ; dir = path.dirname(dir)) {
    const insideWorkspace = workspaceRoots.some((w) => isWithin(w, dir));
    for (const marker of MARKERS) {
      const entry = path.join(dir, ...marker);
      if (!lstatOrNull(entry)) continue;
      const target = realOrFail(entry);
      const allowed = admitted.some((r) => isWithin(r, target)) || ctx.contexts.some((c) => samePath(c, target));
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
      const opened = fs.fstatSync(fd);
      // Identidade no descritor aberto: o que foi aberto é o mesmo arquivo regular que o lstat aprovou.
      if (!opened.isFile() || opened.nlink > 1 || opened.ino !== st.ino || opened.dev !== st.dev) throw new Error("identity");
      const buf = Buffer.alloc(MAX_META_BYTES);
      n = fs.readSync(fd, buf, 0, MAX_META_BYTES, 0);
      text = buf.toString("utf8", 0, n);
    } finally { fs.closeSync(fd); }
  } catch { throw fail(GIT_UNDECIDABLE, `${what} cannot be read`); }
  if (n >= MAX_META_BYTES) throw fail(GIT_UNDECIDABLE, `${what} is too large`);
  return text;
}

/** Uma única linha não vazia, sem NUL; linhas extras não vazias = ponteiro ambíguo. */
function singleLine(text, what) {
  if (text.includes("\0")) throw fail(GIT_UNDECIDABLE, `${what} is malformed`);
  const [first, ...extra] = text.split(/\r?\n/);
  if (extra.some((l) => l.trim() !== "")) throw fail(GIT_UNDECIDABLE, `${what} is ambiguous`);
  const line = first.trim();
  if (!line) throw fail(GIT_UNDECIDABLE, `${what} is empty`);
  return line;
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

/** Fecha a linhagem recíproca do `.git` arquivo `git` (na raiz `dir` do worktree) e devolve a origem registrada. */
function linkedOrigin(ctx, dir, git) {
  const match = /^gitdir:\s*(\S.*)$/.exec(singleLine(readMetaFile(git, ".git file"), ".git file"));
  if (!match) throw fail(GIT_UNDECIDABLE, ".git file has no gitdir pointer");
  const gitdir = metaDir(ctx, path.resolve(dir, match[1]), "gitdir");
  const pointer = singleLine(readMetaFile(path.join(gitdir, "commondir"), "commondir file"), "commondir file");
  const common = metaDir(ctx, path.resolve(gitdir, pointer), "common git dir");
  if (path.basename(common).toLowerCase() !== ".git") throw fail(GIT_UNDECIDABLE, "common git dir is not a .git directory");
  if (!samePath(path.dirname(gitdir), path.join(common, "worktrees"))) throw fail(GIT_UNDECIDABLE, "gitdir is not a linked worktree of its common dir");
  const origin = path.dirname(common);
  if (!inWorkspace(ctx, origin)) throw fail("WORKTREE_ORIGIN_ALIEN", "worktree origin belongs to another owner");
  // Backlink: só a .git que o gitdir reconhece como sua fecha a linhagem (cópias do mesmo .git falham).
  const backlink = singleLine(readMetaFile(path.join(gitdir, "gitdir"), "gitdir backlink"), "gitdir backlink");
  if (!path.isAbsolute(backlink)) throw fail(GIT_UNDECIDABLE, "gitdir backlink is not absolute");
  if (!samePath(path.resolve(backlink), git)) throw fail(GIT_UNDECIDABLE, "gitdir backlink does not return to this worktree");
  return origin;
}

/**
 * Sobe de `cwd` até o primeiro `.git` (limitado por `stopAt` quando o cwd está num workspace).
 * -> {root, origin, linked} | null. `linked` = worktree vinculado com linhagem recíproca fechada.
 */
function worktreeOrigin(ctx, cwd, stopAt) {
  for (let dir = cwd; ; dir = path.dirname(dir)) {
    const git = path.join(dir, ".git");
    const st = lstatOrNull(git);
    if (st) {
      if (st.isSymbolicLink()) throw fail("WORKTREE_ALIAS", ".git entry is a link/junction");
      if (st.isDirectory()) return { root: dir, origin: dir, linked: false };
      if (!st.isFile()) throw fail(GIT_UNDECIDABLE, ".git entry is not a file or directory");
      return { root: dir, origin: linkedOrigin(ctx, dir, git), linked: true };
    }
    if ((stopAt && samePath(dir, stopAt)) || path.dirname(dir) === dir) return null;
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
  const registered = ctx.workspaces.find((w) => isWithin(w, real));
  if (registered) {
    checkMarkers(ctx, real, opts.ancestorLimit);
    const found = worktreeOrigin(ctx, real, registered);
    return frozen({ userId: ctx.id, cwd: real, workspaceRoot: registered, worktreeOrigin: found ? found.origin : null });
  }
  // Fora dos roots: só um worktree vinculado de origem registrada (linhagem recíproca) concede posse.
  const found = worktreeOrigin(ctx, real, null);
  if (!found?.linked) throw fail("WORKSPACE_NOT_OWNED", "cwd is not inside a workspace owned by this user");
  checkMarkers(ctx, real, opts.ancestorLimit, found.root);
  return frozen({ userId: ctx.id, cwd: real, workspaceRoot: found.root, worktreeOrigin: found.origin });
}

function readHeaderMetadata(file) {
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(MAX_HEADER_BYTES);
    const n = fs.readSync(fd, buf, 0, MAX_HEADER_BYTES, 0);
    const end = buf.subarray(0, n).indexOf(0x0a);
    if (end === -1 && n === MAX_HEADER_BYTES) throw new Error("header too long");
    const header = JSON.parse(buf.toString("utf8", 0, end === -1 ? n : end).replace(/\r$/, ""));
    if (!header || header.type !== "session" || typeof header.cwd !== "string") throw new Error("not a session header");
    const parentSession = header.parentSession;
    if (parentSession !== undefined && parentSession !== null && parentSession !== "" && typeof parentSession !== "string") throw new Error("invalid parent session");
    return { cwd: header.cwd, parentSession: parentSession || undefined };
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
  let header;
  try { header = readHeaderMetadata(real); } catch { throw fail("SESSION_HEADER_INVALID", "session header is missing or malformed"); }
  let headerWorkspace;
  try { headerWorkspace = assertOwnedWorkspace(ctx, header.cwd, opts); } catch { throw fail("SESSION_HEADER_CWD_UNOWNED", "session header cwd is not owned by this user"); }
  return frozen({ userId: ctx.id, sessionPath: real, sessionRoot, exists: true, workspace: workspace ?? headerWorkspace, parentSession: header.parentSession });
}
