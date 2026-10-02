import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { registerUser, resolveUser, UsersError } from "../users/registry.mjs";
import { assertOwnedSession, assertOwnedWorkspace } from "../users/ownership.mjs";
import { createAccessGuard, createSandbox, denyNetwork, fakeSecret, snapshotEnv } from "./lib/users-sandbox.mjs";

// Registro + propriedade de /usuario. Recurso: UM mkdtemp novo (HOME/USERPROFILE/APPDATA/registry/
// workspaces/sessões sintéticos, só segredos falsos). Sem rede, sem Pi, sem git, sem stores reais.
// Workers (concorrência) são `node` deste mesmo arquivo, com env allowlist e cwd dentro do sandbox.

const self = fileURLToPath(import.meta.url);

async function worker() {
  const [, , , registryPath, id, label, agentDir, workspace] = process.argv;
  try {
    registerUser({ registryPath, id, label, agentDir, workspaces: [workspace], lockTimeoutMs: 20_000 });
    console.log(JSON.stringify({ ok: true }));
  } catch (error) {
    console.log(JSON.stringify({ ok: false, code: error.code ?? "UNEXPECTED" }));
  }
}

function runWorker(sandbox, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [self, "--worker", sandbox.registryPath, ...args], {
      cwd: sandbox.dirs.tmp, env: sandbox.env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
    let out = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("worker timed out")); }, 30_000);
    child.stdout.on("data", (c) => { out += c; });
    child.on("error", reject);
    child.on("close", () => { clearTimeout(timer); try { resolve(JSON.parse(out.trim().split("\n").pop())); } catch { reject(new Error("worker produced no result")); } });
  });
}

async function main() {
  const envBefore = snapshotEnv();
  const cwdBefore = process.cwd();
  const sandbox = createSandbox("users-smoke");
  const net0 = denyNetwork(net);
  let guard;
  let failure;
  const report = { junctions: "UNVERIFIED", hardlinks: "UNVERIFIED", workersOk: 0 };
  try {
    const { dirs, registryPath } = sandbox;
    const w = (...p) => path.join(dirs.workspaces, ...p);
    const secrets = { auth: fakeSecret("auth"), settings: fakeSecret("settings"), models: fakeSecret("models"), mcp: fakeSecret("mcp"), memory: fakeSecret("memory"), session: fakeSecret("session"), gitmeta: fakeSecret("gitmeta") };
    const hasSecret = (text) => Object.values(secrets).some((s) => text.includes(s));
    const leak = (text) => hasSecret(text) || text.includes(sandbox.root);
    const rejects = (fn, code, label) => {
      try { fn(); } catch (error) {
        assert.ok(error instanceof UsersError, `${label}: expected UsersError, got ${error?.stack}`);
        assert.equal(error.code, code, `${label}: got ${error.code}`);
        assert.ok(!leak(error.message), `${label}: error message leaks a path or secret`);
        return;
      }
      assert.fail(`${label}: expected ${code}, but it succeeded`);
    };

    // ---- fixtures sintéticas: Evolvera "legado" com credenciais falsas e estado ----
    const evoAgent = sandbox.mkdir("home", ".pi", "agent");
    const evoWs = w("evolvera-ws");
    const header = (cwd) => `${JSON.stringify({ type: "session", version: 3, id: "s", timestamp: "2000-01-01T00:00:00Z", cwd })}\n`;
    const sentinelFiles = [
      sandbox.write(path.join(evoAgent, "auth.json"), JSON.stringify({ token: secrets.auth })),
      sandbox.write(path.join(evoAgent, "settings.json"), JSON.stringify({ k: secrets.settings })),
      sandbox.write(path.join(evoAgent, "models.json"), JSON.stringify({ k: secrets.models })),
      sandbox.write(path.join(evoAgent, "mcp.json"), JSON.stringify({ k: secrets.mcp })),
      sandbox.write(path.join(evoAgent, "sessions", "evo-secret.jsonl"), `${header(evoWs)}${JSON.stringify({ text: secrets.session })}\n`),
      sandbox.write(path.join(evoWs, ".pi", "memory", "m.md"), secrets.memory),
      sandbox.write(path.join(evoWs, ".git", "HEAD"), secrets.gitmeta),
    ];
    const evoSession = sandbox.write(path.join(evoAgent, "sessions", "evo-1.jsonl"), header(evoWs));
    sandbox.mkdir("workspaces", "evolvera-ws", ".git");
    const sharedAgents = sandbox.write(path.join(evoWs, "agents", "scout.md"), "---\nname: scout\nmodel: shared-routing\n---\n");
    const sharedDir = path.dirname(sharedAgents);
    const hashes = new Map(sentinelFiles.concat(evoSession, sharedAgents).map((f) => [f, sandbox.sha(f)]));
    const evoListing = JSON.stringify(fs.readdirSync(evoAgent).sort());

    // O metadado Git da Evolvera inteiro é sentinela: worktree do Kevin não pode ler nada ali.
    guard = createAccessGuard(fs, [...sentinelFiles, path.join(evoWs, ".pi", "memory"), path.join(evoWs, ".git")]);
    guard.install();

    // ---- workspaces do Kevin (criados antes do cadastro; links só depois) ----
    const kevinAgent = path.join(dirs.registryDir, "kevin", "agent");
    const kws = Object.fromEntries(["ws", "ws-agents", "ws-pi", "repo", "wt", "wt-alien", "wt-rel", "wt-bad", "wt-cd-alien", "wt-nocd", "wt-badlayout", "wt-jgit", "wt-jrepo", "wt-hardgit", "wt-hardcd"].map((n) => [n, sandbox.mkdir("workspaces", `kevin-${n}`)]));
    sandbox.mkdir("workspaces", "kevin-ws-evil");

    // ---- bootstrap: Evolvera por referência; Kevin vazio ----
    const evo = registerUser({ registryPath, id: "evolvera", label: "Evolvera", agentDir: evoAgent, workspaces: [evoWs], adoptExisting: true });
    assert.equal(guard.count, 0, "adoção da Evolvera não pode abrir auth/settings/models/mcp/memory");
    assert.equal(evo.adoption, "reference");
    assert.deepEqual(evo.sessionRoots, [path.join(evoAgent, "sessions")]);
    const kevin = registerUser({
      registryPath, id: "kevin", label: "Kevin", agentDir: kevinAgent, workspaces: Object.values(kws), sharedAssets: [sharedDir],
    });
    assert.equal(kevin.adoption, "new");
    assert.ok(!fs.existsSync(kevinAgent), "cadastro não cria agentDir nem executa runtime");
    assert.ok(Object.isFrozen(kevin) && Object.isFrozen(kevin.workspaces), "contexto deve ser imutável");
    assert.throws(() => { kevin.id = "x"; }, TypeError);
    assert.throws(() => { kevin.workspaces.push("x"); }, TypeError);
    const registryText = fs.readFileSync(registryPath, "utf8");
    assert.ok(!hasSecret(registryText), "registro não pode conter segredos");
    const stored = JSON.parse(registryText).users.find((u) => u.id === "kevin");
    assert.deepEqual(Object.keys(stored).sort(), ["adoption", "agentDir", "contexts", "id", "label", "sessionRoots", "sharedAssets", "workspaces"]);
    assert.deepEqual(resolveUser({ registryPath, id: "kevin" }), kevin);
    assert.deepEqual(registerUser({ registryPath, id: "kevin", label: "Kevin", agentDir: kevinAgent, workspaces: Object.values(kws), sharedAssets: [sharedDir] }), kevin, "idempotente");
    rejects(() => registerUser({ registryPath, id: "kevin", label: "Outro", agentDir: kevinAgent }), "USER_EXISTS", "id existente com dados diferentes");
    rejects(() => resolveUser({ registryPath, id: "ninguem" }), "USER_UNKNOWN", "usuário desconhecido");
    rejects(() => resolveUser({ registryPath: path.join(dirs.registryDir, "nao-existe.json"), id: "kevin" }), "REGISTRY_MISSING", "registro ausente");
    rejects(() => resolveUser({ registryPath: "registry.json", id: "kevin" }), "REGISTRY_PATH_INVALID", "registro relativo");

    // ---- cadastros rejeitados não alteram o registro ----
    const before = sandbox.sha(registryPath);
    const reg = (extra, code, label) => rejects(() => registerUser({ registryPath, id: "intruso", label: "x", agentDir: path.join(dirs.registryDir, "intruso", "agent"), ...extra }), code, label);
    reg({ id: "Kevin" }, "USER_ID_INVALID", "id com maiúscula");
    reg({ id: "a" }, "USER_ID_INVALID", "id curto");
    reg({ label: "" }, "LABEL_INVALID", "label vazio");
    reg({ label: "a\nb" }, "LABEL_INVALID", "label com controle");
    reg({ agentDir: "relativo/agent" }, "ROOT_INVALID", "raiz relativa");
    reg({ agentDir: evoAgent }, "ROOT_CONFLICT", "raiz igual");
    reg({ agentDir: path.join(evoAgent, "sub") }, "ROOT_CONFLICT", "raiz contida em outra");
    reg({ agentDir: path.dirname(evoAgent) }, "ROOT_CONFLICT", "raiz que contém outra");
    reg({ workspaces: [evoWs] }, "ROOT_CONFLICT", "workspace igual ao da Evolvera");
    reg({ workspaces: [path.join(evoWs, "pkg")] }, "ROOT_CONFLICT", "workspace dentro da Evolvera");
    reg({ workspaces: [dirs.workspaces] }, "ROOT_CONFLICT", "workspace ancestral de ambos");
    reg({ sessionRoots: [path.join(evoAgent, "sessions")] }, "ROOT_CONFLICT", "session root alheio");
    reg({ sharedAssets: [path.join(evoAgent, "auth.json")] }, "ROOT_CONFLICT", "shared asset auth");
    reg({ sharedAssets: [path.dirname(evoAgent)] }, "ROOT_CONFLICT", "shared asset que contém account root");
    reg({ sharedAssets: [path.join(evoWs, ".pi", "memory")] }, "ROOT_CONFLICT", "shared asset memory");
    reg({ contexts: [path.join(evoWs, ".pi")] }, "ROOT_CONFLICT", "contexto dentro de root alheio");
    reg({ adoptExisting: true }, "ADOPTION_NOT_ALLOWED", "adoção por não-legado");
    const dirty = sandbox.write(path.join(dirs.registryDir, "sujo", "agent", "x.txt"), "x");
    reg({ agentDir: path.dirname(dirty) }, "EXISTING_STATE_NOT_ADOPTED", "agentDir com estado preexistente");
    const unownedSession = sandbox.write(sandbox.dir("unowned-sessions", "old.jsonl"), header(evoWs));
    guard.protect(unownedSession);
    reg({ sessionRoots: [path.dirname(unownedSession)] }, "EXISTING_STATE_NOT_ADOPTED", "session root com estado preexistente");
    const stateWs = sandbox.mkdir("workspaces", "com-estado");
    sandbox.write(path.join(stateWs, ".pi", "memory", "m.md"), secrets.memory);
    reg({ workspaces: [stateWs] }, "EXISTING_STATE_NOT_ADOPTED", "workspace com memória preexistente");
    assert.equal(sandbox.sha(registryPath), before, "rejeições não podem alterar o registro");

    // ---- registro malformado: rejeitado para leitura e escrita, bytes intactos ----
    const good = fs.readFileSync(registryPath, "utf8");
    const parsed = JSON.parse(good);
    const mutate = (fn) => { const c = structuredClone(parsed); fn(c); return JSON.stringify(c); };
    const badCases = {
      empty: "", brace: "{", array: "[]", null: "null", truncated: good.slice(0, Math.floor(good.length / 2)),
      version: mutate((c) => { c.version = 2; }), topKey: mutate((c) => { c.activeUser = "kevin"; }),
      usersType: mutate((c) => { c.users = {}; }), duplicate: mutate((c) => { c.users.push(c.users[0]); }),
      extraKey: mutate((c) => { c.users[1].token = "x"; }), relative: mutate((c) => { c.users[1].agentDir = "rel"; }),
      conflict: mutate((c) => { c.users[1].workspaces.push(c.users[0].workspaces[0]); }),
      noSessions: mutate((c) => { c.users[1].sessionRoots = []; }), badId: mutate((c) => { c.users[1].id = "K"; }),
    };
    for (const [name, text] of Object.entries(badCases)) {
      const file = sandbox.write(path.join(dirs.registryDir, "bad", `${name}.json`), text);
      const sum = sandbox.sha(file);
      rejects(() => resolveUser({ registryPath: file, id: "kevin" }), "REGISTRY_MALFORMED", `resolve ${name}`);
      rejects(() => registerUser({ registryPath: file, id: "novo", label: "N", agentDir: path.join(dirs.registryDir, "novo", "agent") }), "REGISTRY_MALFORMED", `register ${name}`);
      assert.equal(sandbox.sha(file), sum, `${name}: registro malformado não pode ser sobrescrito`);
    }

    // ---- workspace: dono, vizinhos e contexto ----
    const L = { ancestorLimit: sandbox.root };
    const own = assertOwnedWorkspace(kevin, kws.ws, L);
    assert.equal(own.workspaceRoot, kws.ws);
    assert.equal(own.userId, "kevin");
    assert.ok(Object.isFrozen(own));
    assert.equal(assertOwnedWorkspace(evo, evoWs, L).worktreeOrigin, evoWs);
    const sub = sandbox.mkdir("workspaces", "kevin-ws", "src");
    assert.equal(assertOwnedWorkspace(kevin, sub, L).workspaceRoot, kws.ws);
    for (const [label, cwd] of [["workspace da Evolvera", evoWs], ["memória da Evolvera", path.join(evoWs, ".pi", "memory")], ["ancestral comum", dirs.workspaces], ["prefixo de string", w("kevin-ws-evil")], ["shared asset", sharedDir], ["raiz de agente", evoAgent]]) {
      rejects(() => assertOwnedWorkspace(kevin, cwd, L), "WORKSPACE_NOT_OWNED", label);
    }
    rejects(() => assertOwnedWorkspace(kevin, "relativo", L), "WORKSPACE_INVALID", "cwd relativo");
    rejects(() => assertOwnedWorkspace(kevin, w("kevin-ws", "nao-existe"), L), "WORKSPACE_INVALID", "cwd inexistente");
    rejects(() => assertOwnedWorkspace(evo, kws.ws, L), "WORKSPACE_NOT_OWNED", "Evolvera em workspace do Kevin");
    rejects(() => assertOwnedWorkspace({ ...kevin }, kws.ws, L), "CONTEXT_INVALID", "contexto forjado");
    rejects(() => assertOwnedWorkspace(JSON.parse(JSON.stringify(kevin)), kws.ws, L), "CONTEXT_INVALID", "contexto clonado");
    rejects(() => assertOwnedWorkspace(kevin, kws.ws, { ancestorLimit: w("kevin-ws-evil") }), "OPTION_INVALID", "limite que não contém cwd");

    // contextos ancestrais: marcador não admitido recusa; marcador admitido exato aceita
    const zoneA = sandbox.mkdir("workspaces", "zona-a");
    sandbox.write(path.join(zoneA, "AGENTS.md"), "ctx");
    const zoneB = sandbox.mkdir("workspaces", "zona-b");
    sandbox.write(path.join(zoneB, "AGENTS.md"), "ctx");
    const ctxA = registerUser({ registryPath, id: "ctx-a", label: "A", agentDir: path.join(dirs.registryDir, "ctx-a", "agent"), workspaces: [sandbox.mkdir("workspaces", "zona-a", "ws")] });
    const ctxB = registerUser({ registryPath, id: "ctx-b", label: "B", agentDir: path.join(dirs.registryDir, "ctx-b", "agent"), workspaces: [sandbox.mkdir("workspaces", "zona-b", "ws")], contexts: [path.join(zoneB, "AGENTS.md")] });
    rejects(() => assertOwnedWorkspace(ctxA, ctxA.workspaces[0], L), "ANCESTOR_CONTEXT_UNADMITTED", "contexto ancestral não admitido");
    assertOwnedWorkspace(ctxB, ctxB.workspaces[0], L);

    // ---- sessões ----
    const ks = path.join(kevinAgent, "sessions");
    const kOk = sandbox.write(path.join(ks, "ok.jsonl"), `${header(kws.ws)}${JSON.stringify({ text: secrets.session })}\n`);
    const kAlien = sandbox.write(path.join(ks, "alien-header.jsonl"), header(evoWs));
    const kBadHeader = sandbox.write(path.join(ks, "bad-header.jsonl"), "not json\n");
    const kNoType = sandbox.write(path.join(ks, "no-type.jsonl"), `${JSON.stringify({ cwd: kws.ws })}\n`);
    const evoSecretSession = path.join(evoAgent, "sessions", "evo-secret.jsonl");
    assert.equal(assertOwnedSession(kevin, { sessionPath: kOk }, L).exists, true);
    assert.equal(assertOwnedSession(kevin, { sessionPath: kOk, cwd: sub }, L).workspace.cwd, sub);
    assert.equal(assertOwnedSession(evo, { sessionPath: evoSession }, L).userId, "evolvera");
    const fresh = assertOwnedSession(kevin, { sessionPath: path.join(ks, "novo.jsonl"), cwd: kws.ws }, L);
    assert.equal(fresh.exists, false);
    rejects(() => assertOwnedSession(kevin, { sessionPath: path.join(ks, "novo.jsonl") }, L), "SESSION_CWD_REQUIRED", "sessão nova sem cwd");
    rejects(() => assertOwnedSession(kevin, { sessionPath: path.join(ks, "novo.jsonl"), cwd: evoWs }, L), "WORKSPACE_NOT_OWNED", "destino com cwd alheio");
    rejects(() => assertOwnedSession(kevin, { sessionPath: kOk, cwd: evoWs }, L), "WORKSPACE_NOT_OWNED", "cwd explícito alheio");
    rejects(() => assertOwnedSession(kevin, { sessionPath: kAlien }, L), "SESSION_HEADER_CWD_UNOWNED", "header com cwd alheio");
    rejects(() => assertOwnedSession(kevin, { sessionPath: kBadHeader }, L), "SESSION_HEADER_INVALID", "header malformado");
    rejects(() => assertOwnedSession(kevin, { sessionPath: kNoType }, L), "SESSION_HEADER_INVALID", "header sem type");
    rejects(() => assertOwnedSession(kevin, { sessionPath: ks }, L), "SESSION_NOT_OWNED", "raiz de sessões como arquivo");
    rejects(() => assertOwnedSession(kevin, { sessionPath: "relativo.jsonl" }, L), "SESSION_INVALID", "sessão relativa");
    rejects(() => assertOwnedSession(kevin, { sessionPath: evoSecretSession }, L), "SESSION_NOT_OWNED", "sessão da Evolvera");
    rejects(() => assertOwnedSession(kevin, { sessionPath: `${ks}${path.sep}${path.relative(ks, evoSecretSession)}` }, L), "SESSION_NOT_OWNED", "traversal para sessão alheia");
    rejects(() => assertOwnedSession(evo, { sessionPath: kOk }, L), "SESSION_NOT_OWNED", "Evolvera em sessão do Kevin");
    rejects(() => assertOwnedSession(kevin, { sessionPath: path.join(sharedDir, "scout.md"), cwd: kws.ws }, L), "SESSION_NOT_OWNED", "shared asset não é raiz de sessões");
    assert.equal(guard.count, 0, "nenhum sentinel (auth/settings/models/mcp/memory/sessão alheia) pode ser acessado");

    // ---- junctions: aliases e links dentro de roots admitidas ----
    const probe = sandbox.makeLink(sharedDir, w("probe-link"));
    if (!probe.ok) {
      report.junctions = `UNVERIFIED (${probe.code}): link/junction creation unavailable on this platform`;
    } else {
      report.junctions = "VERIFIED";
      const beforeLinks = sandbox.sha(registryPath);
      const link = (target, at) => assert.ok(sandbox.makeLink(target, at).ok, "link fixture");
      link(evoAgent, w("alias-agent"));
      reg({ agentDir: w("alias-agent") }, "ROOT_ALIAS", "raiz é junction");
      reg({ agentDir: path.join(w("alias-agent"), "filho") }, "ROOT_ALIAS", "ancestral da raiz é junction");
      reg({ workspaces: [w("alias-agent")] }, "ROOT_ALIAS", "workspace é junction");
      reg({ sessionRoots: [w("alias-agent")] }, "ROOT_ALIAS", "session root é junction");
      assert.equal(sandbox.sha(registryPath), beforeLinks, "rejeições por alias não alteram o registro");

      link(evoWs, path.join(kws.ws, "leak"));
      rejects(() => assertOwnedWorkspace(kevin, path.join(kws.ws, "leak"), L), "WORKSPACE_ALIAS", "junction para workspace alheio");
      link(sub, path.join(kws.ws, "inner"));
      rejects(() => assertOwnedWorkspace(kevin, path.join(kws.ws, "inner"), L), "WORKSPACE_ALIAS", "junction interna também é alias");
      rejects(() => assertOwnedWorkspace(evo, w("probe-link"), L), "WORKSPACE_ALIAS", "alias de shared asset");

      link(sharedDir, path.join(kws["ws-agents"], ".agents"));
      assertOwnedWorkspace(kevin, kws["ws-agents"], L); // asset admitido não autoriza credencial, só recurso
      link(path.join(evoWs, ".pi"), path.join(kws["ws-pi"], ".pi"));
      rejects(() => assertOwnedWorkspace(kevin, kws["ws-pi"], L), "RESOURCE_ESCAPES_OWNER", ".pi aponta para memória alheia");

      link(path.join(evoAgent, "sessions"), path.join(ks, "via-link"));
      rejects(() => assertOwnedSession(kevin, { sessionPath: path.join(ks, "via-link", "evo-secret.jsonl") }, L), "SESSION_ALIAS", "sessão via junction");

      const driftZone = sandbox.mkdir("drift-zone");
      registerUser({ registryPath, id: "drift", label: "Drift", agentDir: path.join(driftZone, "agent") });
      fs.rmdirSync(driftZone);
      link(sandbox.mkdir("elsewhere"), driftZone);
      rejects(() => resolveUser({ registryPath, id: "drift" }), "ROOT_DRIFT", "raiz virou junction depois do cadastro");
    }

    // ---- worktrees: origem decide a posse ----
    const repoGit = path.join(kws.repo, ".git");
    const wtMeta = (name, commondir, base = "worktrees") => sandbox.write(path.join(repoGit, base, name, "commondir"), commondir);
    const gitFile = (ws, gitdir) => sandbox.write(path.join(ws, ".git"), `gitdir: ${gitdir}\n`);
    wtMeta("wt1", "../..\n");
    sandbox.write(path.join(kws.wt, ".git"), `gitdir: ${path.join(kws.repo, ".git", "worktrees", "wt1")}\n`);
    sandbox.write(path.join(kws["wt-rel"], ".git"), "gitdir: ../kevin-repo/.git/worktrees/wt1\n");
    sandbox.write(path.join(kws["wt-alien"], ".git"), `gitdir: ${path.join(evoWs, ".git", "worktrees", "w1")}\n`);
    sandbox.write(path.join(kws["wt-bad"], ".git"), "lixo\n");
    assert.equal(assertOwnedWorkspace(kevin, kws.repo, L).worktreeOrigin, kws.repo);
    assert.equal(assertOwnedWorkspace(kevin, kws.wt, L).worktreeOrigin, kws.repo);
    assert.equal(assertOwnedWorkspace(kevin, kws["wt-rel"], L).worktreeOrigin, kws.repo);
    rejects(() => assertOwnedWorkspace(kevin, kws["wt-alien"], L), "WORKTREE_ORIGIN_ALIEN", "worktree de repositório alheio");
    rejects(() => assertOwnedWorkspace(kevin, kws["wt-bad"], L), "WORKTREE_ORIGIN_UNDECIDABLE", ".git sem ponteiro");
    // gitdir lexicalmente do Kevin, mas o commondir real resolve para o repositório da Evolvera:
    // rejeitado só com metadados (o .git alheio inteiro é sentinela do guard).
    wtMeta("wt2", `${path.join(evoWs, ".git")}\n`);
    gitFile(kws["wt-cd-alien"], path.join(repoGit, "worktrees", "wt2"));
    rejects(() => assertOwnedWorkspace(kevin, kws["wt-cd-alien"], L), "WORKTREE_ORIGIN_ALIEN", "gitdir do Kevin com commondir alheio");
    // gitdir sem commondir (submódulo/separate-git-dir/desconhecido): indecidível, nunca adivinhado pelo caminho
    sandbox.mkdir("workspaces", "kevin-repo", ".git", "worktrees", "wt3");
    gitFile(kws["wt-nocd"], path.join(repoGit, "worktrees", "wt3"));
    rejects(() => assertOwnedWorkspace(kevin, kws["wt-nocd"], L), "WORKTREE_ORIGIN_UNDECIDABLE", "gitdir sem commondir");
    // commondir consistente, mas o gitdir não é <comum>/worktrees/<nome>
    wtMeta("wt5", "../..\n", "other");
    gitFile(kws["wt-badlayout"], path.join(repoGit, "other", "wt5"));
    rejects(() => assertOwnedWorkspace(kevin, kws["wt-badlayout"], L), "WORKTREE_ORIGIN_UNDECIDABLE", "gitdir fora de worktrees/");
    assert.equal(guard.count, 0, "metadado Git alheio não pode ser lido");
    if (report.junctions === "VERIFIED") {
      assert.ok(sandbox.makeLink(repoGit, path.join(kws["wt-jgit"], ".git")).ok, "link fixture");
      rejects(() => assertOwnedWorkspace(kevin, kws["wt-jgit"], L), "WORKTREE_ALIAS", ".git é junction");
      assert.ok(sandbox.makeLink(kws.repo, path.join(kws["wt-jrepo"], "jrepo")).ok, "link fixture");
      gitFile(kws["wt-jrepo"], path.join(kws["wt-jrepo"], "jrepo", ".git", "worktrees", "wt1"));
      rejects(() => assertOwnedWorkspace(kevin, kws["wt-jrepo"], L), "WORKTREE_ALIAS", "gitdir via junction");
    }

    // ---- hardlinks: outro caminho para o mesmo inode não prova estado distinto ----
    // Cada vínculo liga dois arquivos DESTA run (fixture sentinela incluída). Caminhos-alias sobre
    // sentinelas entram no guard: qualquer abertura de conteúdo por eles seria contada e falharia.
    const hlProbe = sandbox.makeHardLink(sandbox.write(sandbox.dir("hl", "probe-a"), "x"), sandbox.dir("hl", "probe-b"));
    if (!hlProbe.ok) {
      report.hardlinks = `UNVERIFIED (${hlProbe.code}): hardlink creation unavailable on this filesystem`;
    } else {
      report.hardlinks = "VERIFIED";
      const hl = (target, at, protect = false) => {
        assert.ok(sandbox.makeHardLink(target, at).ok, "hardlink fixture");
        assert.ok(fs.lstatSync(at).nlink > 1, "hardlink fixture must share the inode");
        if (protect) guard.protect(at);
      };
      const regSum = sandbox.sha(registryPath);
      // registro apontando (hardlink) para um sentinela protegido
      const aliasReg = path.join(dirs.registryDir, "alias", "registry.json");
      hl(path.join(evoAgent, "auth.json"), aliasReg, true);
      rejects(() => resolveUser({ registryPath: aliasReg, id: "kevin" }), "REGISTRY_ALIAS", "resolve: registro é hardlink de sentinela");
      rejects(() => registerUser({ registryPath: aliasReg, id: "novo", label: "N", agentDir: path.join(dirs.registryDir, "novo", "agent") }), "REGISTRY_ALIAS", "register: registro é hardlink de sentinela");
      assert.deepEqual(fs.readdirSync(path.dirname(aliasReg)), ["registry.json"], "sem lock/tmp ao rejeitar alias");
      // registro válido com dois nomes: rejeitado mesmo com conteúdo válido; cópia independente é aceita
      const regCopy = (name) => sandbox.write(path.join(dirs.registryDir, "hl", name), fs.readFileSync(registryPath));
      const hlA = regCopy("a.json");
      // Captura antes de proteger; a comparação ocorre junto das outras fixtures,
      // somente após terminar o código sob teste e restaurar o guard.
      hashes.set(hlA, sandbox.sha(hlA));
      hl(hlA, path.join(dirs.registryDir, "hl", "b.json"), true);
      guard.protect(hlA);
      for (const name of ["a.json", "b.json"]) {
        const file = path.join(dirs.registryDir, "hl", name);
        rejects(() => resolveUser({ registryPath: file, id: "kevin" }), "REGISTRY_ALIAS", `resolve: registro válido com hardlink ${name}`);
        rejects(() => registerUser({ registryPath: file, id: "novo", label: "N", agentDir: path.join(dirs.registryDir, "novo", "agent") }), "REGISTRY_ALIAS", `register: registro válido com hardlink ${name}`);
      }
      assert.equal(resolveUser({ registryPath: regCopy("independente.json"), id: "kevin" }).id, "kevin", "cópia sem hardlink é aceita");
      assert.equal(sandbox.sha(registryPath), regSum, "registro real não mudou");
      // sessão do Kevin ligada ao sentinela da Evolvera, e sessão do Kevin com dois nomes
      const kLinked = path.join(ks, "linked-evo.jsonl");
      hl(evoSecretSession, kLinked, true);
      rejects(() => assertOwnedSession(kevin, { sessionPath: kLinked }, L), "SESSION_ALIAS", "sessão hardlink de sentinela da Evolvera");
      rejects(() => assertOwnedSession(kevin, { sessionPath: kLinked, cwd: kws.ws }, L), "SESSION_ALIAS", "sessão hardlink de sentinela, com cwd");
      hl(kOk, path.join(ks, "ok-second-name.jsonl"));
      rejects(() => assertOwnedSession(kevin, { sessionPath: kOk }, L), "SESSION_ALIAS", "sessão do Kevin com segundo nome");
      rejects(() => assertOwnedSession(kevin, { sessionPath: path.join(ks, "ok-second-name.jsonl") }, L), "SESSION_ALIAS", "segundo nome da sessão");
      // metadados de worktree com hardlink: .git arquivo e commondir
      hl(path.join(kws.wt, ".git"), path.join(kws["wt-hardgit"], ".git"));
      rejects(() => assertOwnedWorkspace(kevin, kws["wt-hardgit"], L), "WORKTREE_ALIAS", ".git arquivo com hardlink");
      wtMeta("wt1b", "../..\n");
      hl(path.join(repoGit, "worktrees", "wt1b", "commondir"), path.join(repoGit, "worktrees", "wt6", "commondir"));
      gitFile(kws["wt-hardcd"], path.join(repoGit, "worktrees", "wt6"));
      rejects(() => assertOwnedWorkspace(kevin, kws["wt-hardcd"], L), "WORKTREE_ALIAS", "commondir com hardlink");
      assert.equal(guard.count, 0, "nenhuma abertura de conteúdo por caminho-alias");
    }

    // ---- concorrência: escritores reais em processos separados ----
    const regBeforeRace = JSON.parse(fs.readFileSync(registryPath, "utf8")).users.length;
    const jobs = [1, 2, 3, 4, 5, 6].map((n) => runWorker(sandbox, [`w${n}`, `W${n}`, path.join(dirs.registryDir, `w${n}`, "agent"), w(`w${n}-ws`)]));
    jobs.push(runWorker(sandbox, ["corrida", "A", path.join(dirs.registryDir, "corrida", "agent"), w("corrida-ws")]));
    jobs.push(runWorker(sandbox, ["corrida", "B", path.join(dirs.registryDir, "corrida", "agent"), w("corrida-ws")]));
    const results = await Promise.all(jobs);
    report.workersOk = results.filter((r) => r.ok).length;
    assert.equal(results.slice(0, 6).every((r) => r.ok), true, `workers: ${JSON.stringify(results)}`);
    const racers = results.slice(6);
    assert.equal(racers.filter((r) => r.ok).length, 1, "exatamente um vence a corrida pelo mesmo id");
    assert.equal(racers.find((r) => !r.ok).code, "USER_EXISTS");
    const after = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    assert.equal(after.users.length, regBeforeRace + 7, "nenhum cadastro perdido");
    for (const id of ["evolvera", "kevin", "ctx-a", "ctx-b", "w1", "w2", "w3", "w4", "w5", "w6", "corrida"]) resolveUser({ registryPath, id });
    assert.deepEqual(fs.readdirSync(dirs.registryDir).filter((n) => /\.(tmp|lock)$/.test(n)), [], "sem lock/tmp residual");

    // lockTimeoutMs inválido é recusado antes de qualquer lock/escrita
    const sumOpts = sandbox.sha(registryPath);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, "150", null, {}]) {
      rejects(() => registerUser({ registryPath, id: "opcao", label: "O", agentDir: path.join(dirs.registryDir, "opcao", "agent"), lockTimeoutMs: bad }), "OPTION_INVALID", `lockTimeoutMs ${String(bad)}`);
    }
    assert.equal(sandbox.sha(registryPath), sumOpts, "opção inválida não altera o registro");
    assert.ok(!fs.existsSync(`${registryPath}.lock`), "opção inválida não cria lock");

    // Sem roubo/recuperação automática: lock existente (fresco OU velho) sempre dá timeout, registro
    // intacto e o lock alheio nunca é removido por quem não o adquiriu.
    const lock = sandbox.assertInside(`${registryPath}.lock`);
    fs.mkdirSync(lock);
    const sumLocked = sandbox.sha(registryPath);
    const blocked = () => registerUser({ registryPath, id: "bloqueado", label: "B", agentDir: path.join(dirs.registryDir, "bloqueado", "agent"), lockTimeoutMs: 150 });
    rejects(blocked, "REGISTRY_LOCK_TIMEOUT", "lock fresco");
    assert.equal(sandbox.sha(registryPath), sumLocked);
    assert.ok(fs.existsSync(lock), "lock fresco alheio permanece");
    const old = new Date(Date.now() - 3_600_000);
    fs.utimesSync(lock, old, old);
    sandbox.write(`${registryPath}.99999.deadbeef.tmp`, '{"version":1,"us');
    rejects(blocked, "REGISTRY_LOCK_TIMEOUT", "lock velho também dá timeout");
    rejects(() => registerUser({ registryPath, id: "bloqueado", label: "B", agentDir: path.join(dirs.registryDir, "bloqueado", "agent"), lockTimeoutMs: 0 }), "REGISTRY_LOCK_TIMEOUT", "lock velho com timeout zero");
    assert.equal(sandbox.sha(registryPath), sumLocked, "lock velho não permite mutação");
    assert.ok(fs.existsSync(lock), "lock velho alheio permanece");
    assert.throws(() => resolveUser({ registryPath, id: "bloqueado" }), { code: "USER_UNKNOWN" }, "nenhum cadastro ocorreu");
    // Operador remove SÓ o lock criado por este teste (dentro do sandbox) para provar operações seguintes.
    fs.rmdirSync(lock);
    registerUser({ registryPath, id: "apos-lock", label: "R", agentDir: path.join(dirs.registryDir, "apos-lock", "agent"), lockTimeoutMs: 0 });
    assert.ok(!fs.existsSync(lock), "lock próprio liberado");
    resolveUser({ registryPath, id: "apos-lock" });

    // ---- preservação e zero acesso ----
    assert.equal(guard.count, 0, "zero acesso a sentinelas");
    assert.equal(net0.attempts, 0, "zero tentativa de rede");
    // Todas as operações sob teste terminaram. O verificador independente precisa
    // abrir as próprias fixtures protegidas para comparar seus hashes.
    guard.restore();
    for (const [file, sum] of hashes) assert.equal(sandbox.sha(file), sum, "fixture Evolvera preservada byte a byte");
    assert.equal(JSON.stringify(fs.readdirSync(evoAgent).sort()), evoListing, "Evolvera não ganhou/perdeu entradas");
    assert.equal(snapshotEnv(), envBefore, "process.env do pai intacto");
    assert.equal(process.cwd(), cwdBefore);
  } catch (error) {
    failure = error;
  } finally {
    guard?.restore();
    net0.restore();
    const removed = sandbox.cleanup();
    if (!removed && !failure) failure = new Error("sandbox cleanup left files behind");
  }
  if (failure) throw failure;
  console.log(`OK users-registry.smoke (junctions: ${report.junctions}; hardlinks: ${report.hardlinks}; workers ok: ${report.workersOk}; sandbox removed)`);
  if (report.junctions !== "VERIFIED" || report.hardlinks !== "VERIFIED") {
    console.error("UNVERIFIED: junction and/or hardlink cases were not exercised on this platform");
    process.exitCode = 3;
  }
}

if (process.argv[2] === "--worker") await worker();
else await main();
