// Fixture run-owned para os smokes de /usuario. Nada aqui toca HOME, env ou stores reais.
//
// - `createSandbox()` cria UM mkdtemp novo (canonicalizado) contendo home/USERPROFILE/APPDATA/
//   config/cache/staging/tmp/registry/workspaces; só segredos sintéticos (`fakeSecret`).
// - `sandbox.env` é uma allowlist operacional construída do zero (nunca spread de process.env;
//   só SystemRoot/windir são copiados para o node funcionar no Windows). O process.env do
//   processo pai nunca é alterado.
// - `createAccessGuard(fs, protectedPaths)` envolve operações de conteúdo do `fs` padrão (os
//   módulos sob teste usam `import fs from "node:fs"`): qualquer leitura/escrita/abertura sob
//   um caminho sentinela é contada e lançada como SENTINEL_ACCESS. Metadados (stat/lstat/
//   realpath/exists) não são conteúdo e não contam.
// - `denyNetwork(net)` conta e bloqueia qualquer connect externo (esta fatia não usa rede).
// - `cleanup()` só remove descendentes do mkdtemp: desfaz links registrados (junctions) com
//   rmdir/unlink antes do rm recursivo (hardlinks, com ambos os lados na run, caem no rm
//   recursivo; `makeHardLink` recusa qualquer caminho fora da raiz), e recusa se a raiz deixou de ser a canônica original.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";

// Referências originais capturadas antes de qualquer guard, usadas só pelo cleanup/fixtures.
const orig = {
  rmSync: fs.rmSync, rmdirSync: fs.rmdirSync, unlinkSync: fs.unlinkSync, lstatSync: fs.lstatSync,
  readFileSync: fs.readFileSync, writeFileSync: fs.writeFileSync, mkdirSync: fs.mkdirSync,
  realpathNative: fs.realpathSync.native,
  linkSync: fs.linkSync,
};

const within = (parent, child) => {
  const rel = path.relative(parent, child);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
};

export function fakeSecret(name) {
  return `FAKE-SECRET-${name}-${randomBytes(6).toString("hex")}`;
}

export function createSandbox(label = "users") {
  const tmpBase = orig.realpathNative(os.tmpdir());
  const root = orig.realpathNative(fs.mkdtempSync(path.join(tmpBase, `pi-${label}-`)));
  const links = [];
  const assertInside = (p) => {
    if (!within(root, path.resolve(p))) throw new Error("sandbox: path escapes run root");
    return path.resolve(p);
  };
  const d = (...parts) => path.join(root, ...parts);
  const dirs = {
    home: d("home"), appData: d("appdata", "Roaming"), localAppData: d("appdata", "Local"),
    config: d("config"), cache: d("cache"), staging: d("staging"), tmp: d("tmp"),
    registryDir: d("home", ".pi", "users"), workspaces: d("workspaces"),
  };
  for (const dir of Object.values(dirs)) orig.mkdirSync(dir, { recursive: true });
  const env = {
    HOME: dirs.home, USERPROFILE: dirs.home, APPDATA: dirs.appData, LOCALAPPDATA: dirs.localAppData,
    XDG_CONFIG_HOME: dirs.config, XDG_CACHE_HOME: dirs.cache, TMPDIR: dirs.tmp, TEMP: dirs.tmp, TMP: dirs.tmp,
  };
  for (const key of ["SystemRoot", "windir"]) if (process.env[key]) env[key] = process.env[key];

  const api = {
    root, dirs, env,
    registryPath: path.join(dirs.registryDir, "registry.json"),
    dir: d,
    assertInside,
    mkdir(...parts) { const p = assertInside(d(...parts)); orig.mkdirSync(p, { recursive: true }); return p; },
    write(p, content) {
      assertInside(p);
      orig.mkdirSync(path.dirname(p), { recursive: true });
      orig.writeFileSync(p, content);
      return p;
    },
    read: (p) => orig.readFileSync(assertInside(p)),
    sha: (p) => createHash("sha256").update(orig.readFileSync(assertInside(p))).digest("hex"),
    /** Junction no Windows / symlink de diretório em POSIX. Retorna {ok} ou {ok:false, code}. */
    makeLink(target, linkPath) {
      assertInside(target); assertInside(linkPath);
      try {
        orig.mkdirSync(path.dirname(linkPath), { recursive: true });
        fs.symlinkSync(target, linkPath, "junction");
        links.push(linkPath);
        return { ok: true };
      } catch (error) { return { ok: false, code: error.code ?? "UNKNOWN" }; }
    },
    /** Hardlink entre dois arquivos regulares DESTA run (nlink passa a 2). Retorna {ok} ou {ok:false, code}. */
    makeHardLink(target, linkPath) {
      assertInside(target); assertInside(linkPath);
      try {
        if (!orig.lstatSync(target).isFile()) throw Object.assign(new Error("not a regular file"), { code: "NOT_FILE" });
        orig.mkdirSync(path.dirname(linkPath), { recursive: true });
        orig.linkSync(target, linkPath);
        return { ok: true };
      } catch (error) { return { ok: false, code: error.code ?? "UNKNOWN" }; }
    },
    cleanup() {
      if (!within(tmpBase, root) || path.basename(root).slice(0, 3) !== "pi-") throw new Error("sandbox: refusing cleanup of unexpected root");
      if (orig.realpathNative(root) !== root) throw new Error("sandbox: run root changed identity; refusing cleanup");
      for (const link of links.reverse()) {
        assertInside(link);
        let st = null;
        try { st = orig.lstatSync(link); } catch { /* já removido */ }
        if (!st || !st.isSymbolicLink()) continue;
        try { orig.rmdirSync(link); } catch { orig.unlinkSync(link); }
      }
      orig.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      return !fs.existsSync(root);
    },
  };
  return api;
}

const PATH_ARGS = {
  readFileSync: [0], openSync: [0], readdirSync: [0], opendirSync: [0], createReadStream: [0],
  copyFileSync: [0, 1], cpSync: [0, 1], writeFileSync: [0], appendFileSync: [0], truncateSync: [0],
  renameSync: [0, 1], unlinkSync: [0], rmSync: [0], rmdirSync: [0], mkdirSync: [0],
};
const DESTRUCTIVE = new Set(["renameSync", "unlinkSync", "rmSync", "rmdirSync", "cpSync", "copyFileSync"]);

export function createAccessGuard(fsModule, protectedPaths) {
  const roots = protectedPaths.map((p) => path.resolve(p));
  const originals = new Map();
  const hits = [];
  const guard = {
    hits,
    get count() { return hits.length; },
    /** Acrescenta caminhos sentinela depois do install (ex.: arquivo só alien para um caso). */
    protect(p) { roots.push(path.resolve(p)); },
    install() {
      for (const [name, indexes] of Object.entries(PATH_ARGS)) {
        const fn = fsModule[name];
        if (typeof fn !== "function" || originals.has(name)) continue;
        originals.set(name, fn);
        fsModule[name] = function guarded(...args) {
          for (const i of indexes) {
            const arg = args[i];
            if (typeof arg !== "string" && !(arg instanceof URL) && !Buffer.isBuffer(arg)) continue;
            const resolved = path.resolve(arg instanceof URL ? arg.pathname : String(arg));
            const hit = roots.some((r) => within(r, resolved) || (DESTRUCTIVE.has(name) && within(resolved, r)));
            if (hit) {
              hits.push({ op: name });
              const error = new Error(`SENTINEL_ACCESS: ${name} on a protected fixture path`);
              error.code = "SENTINEL_ACCESS";
              throw error;
            }
          }
          return fn.apply(this, args);
        };
      }
    },
    restore() {
      for (const [name, fn] of originals) fsModule[name] = fn;
      originals.clear();
    },
  };
  return guard;
}

export function denyNetwork(netModule) {
  const original = netModule.Socket.prototype.connect;
  const attempts = [];
  netModule.Socket.prototype.connect = function denied() {
    attempts.push(1);
    throw Object.assign(new Error("NETWORK_DENIED: external connections are blocked in this smoke"), { code: "NETWORK_DENIED" });
  };
  return { get attempts() { return attempts.length; }, restore() { netModule.Socket.prototype.connect = original; } };
}

export function snapshotEnv() {
  return createHash("sha256").update(JSON.stringify(Object.entries(process.env).sort())).digest("hex");
}
