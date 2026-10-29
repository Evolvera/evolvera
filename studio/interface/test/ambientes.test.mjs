// Ambientes: user-created folders shown as boxes in the sidebar. Run-owned temp dirs, fake PI and fake DOM only.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { ambienteFolder, ambienteName, createAmbientes, folderName } from "../lib-server/ambientes.mjs";
import { createSidebarTree } from "../public/sidebar-tree.js";
import { FakeDocument, FakeElement } from "./fake-dom.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-studio-ambientes-"));
const home = path.join(tmp, "home");
await mkdir(home, { recursive: true });

describe("ambiente rules", () => {
  test("names and folder names", () => {
    assert.equal(folderName('  Loja: "Pix" / v2.  '), "Loja Pix v2");
    assert.equal(folderName("CON"), "");
    assert.equal(folderName("???"), "");
    assert.equal(ambienteName("  Financeiro   BLVR "), "Financeiro BLVR");
    assert.throws(() => ambienteName("   "), /nome/);
  });

  test("folder: the chosen absolute path, or <home>/PI Ambientes/<nome>; never relative, .. or a drive root", () => {
    assert.equal(ambienteFolder({ name: "Loja", home }), path.join(home, "PI Ambientes", "Loja"));
    assert.equal(ambienteFolder({ name: "x", cwd: path.join(tmp, "algo"), home }), path.join(tmp, "algo"));
    assert.throws(() => ambienteFolder({ name: "x", cwd: "relativa", home }), /caminho completo/);
    assert.throws(() => ambienteFolder({ name: "x", cwd: `${tmp}${path.sep}..${path.sep}fora`, home }), /caminho completo/);
    assert.throws(() => ambienteFolder({ name: "x", cwd: path.parse(tmp).root, home }), /raiz/);
    assert.throws(() => ambienteFolder({ name: "???", home }), /nome de pasta/);
  });

  test("store: create (making the folder), duplicates refused, rename, remove keeps the folder", async () => {
    const storeFile = path.join(tmp, "store", "ambientes.json");
    let clock = 1000;
    const store = createAmbientes({ storeFile, home, now: () => clock++ });
    const loja = await store.create({ name: "Loja" });
    assert.equal(loja.cwd, path.join(home, "PI Ambientes", "Loja"));
    assert.ok((await stat(loja.cwd)).isDirectory());
    await assert.rejects(store.create({ name: "Outra", cwd: loja.cwd }), /já é um ambiente/);
    const filePath = path.join(tmp, "um-arquivo");
    await writeFile(filePath, "x");
    await assert.rejects(store.create({ name: "Arq", cwd: filePath }), /arquivo/);
    const existing = path.join(tmp, "ja-existe");
    await mkdir(existing);
    const second = await store.create({ name: "Já existe", cwd: existing });
    assert.equal((await store.rename(second.id, "Renomeado")).name, "Renomeado");
    await store.remove(loja.id);
    assert.deepEqual((await store.list()).map((item) => item.name), ["Renomeado"]);
    assert.ok((await stat(loja.cwd)).isDirectory(), "removing an ambiente never deletes its folder");
    await assert.rejects(store.remove(loja.id), /não encontrado/);
    // A fresh instance (Studio restart) reads the same list from disk.
    assert.deepEqual((await createAmbientes({ storeFile, home }).list()).map((item) => item.name), ["Renomeado"]);
  });
});

describe("sidebar boxes", () => {
  const NOW = 1_800_000_000_000;
  const tree = (projects) => {
    const root = new FakeElement("div");
    const sidebar = createSidebarTree({ root, doc: new FakeDocument(), icon: () => "<svg/>" });
    sidebar.render({ data: { version: "v", projects }, store: { baseline: NOW, seen: {} }, expanded: new Map(), now: NOW, currentPath: null, extras: new Map(), projectIdFor: (_p, id) => id });
    return root;
  };
  const project = (id, extra = {}) => ({ id, name: `Proj ${id}`, cwd: `/${id}`, envs: [], ...extra });

  test("with ambientes they come first, and every other folder goes into a collapsed Outras pastas", () => {
    const root = tree([project("a", { ambiente: { id: "1", name: "A" } }), project("b"), project("c", { ambiente: { id: "2", name: "C" } }), project("d")]);
    const kids = root.children;
    assert.deepEqual(kids.map((node) => node.dataset.key), ["p:a", "p:c", "g:outras"]);
    assert.deepEqual(kids.slice(0, 2).map((node) => node.dataset.ambiente), ["1", "1"]);
    const group = kids[2];
    const [head, body] = group.children;
    assert.equal(head.getAttribute("aria-expanded"), "false");
    assert.equal(body.hidden, true);
    assert.equal(head.children[1].textContent, "2");
  });

  test("normalizeTree keeps a well-formed ambiente and drops a malformed one", async () => {
    const { normalizeTree } = await import("../public/lib.js");
    const data = normalizeTree({ version: "v", projects: [project("a", { ambiente: { id: "1", name: "A", extra: "x" } }), project("b", { ambiente: "nope" }), project("c")] });
    assert.deepEqual(data.projects.map((item) => item.ambiente ?? null), [{ id: "1", name: "A" }, null, null]);
  });

  test("without ambientes the sidebar stays as it was", () => {
    assert.deepEqual(tree([project("b"), project("d")]).children.map((node) => node.dataset.key), ["p:b", "p:d"]);
  });
});

describe("routes", () => {
  let server;
  let base;
  let token;
  const agentDir = path.join(tmp, "agent");
  const roots = path.join(tmp, "roots");
  before(async () => {
    await mkdir(path.join(roots, "descoberto"), { recursive: true });
    await writeFile(path.join(roots, "descoberto", "package.json"), "{}");
    Object.assign(process.env, { PI_WEB_HOST: "127.0.0.1", PI_WEB_PORT: "0", PI_AGENT_DIR: agentDir, PI_PROJECT_ROOTS: roots, PI_STUDIO_AMBIENTES_HOME: home,
      PI_WEB_PI_BIN: process.execPath, PI_WEB_PI_BIN_ARGS: JSON.stringify([path.join(here, "fake-pi-rpc.mjs")]), PI_STUDIO_ORCA_BIN: path.join(tmp, "no-orca.exe") });
    server = await import("../server.mjs?ambientes");
    const running = await server.startServer(0, "127.0.0.1");
    base = `http://127.0.0.1:${running.address().port}`;
    token = (await (await fetch(base)).text()).match(/name="pi-studio-token" content="([a-f0-9]+)"/)[1];
  });
  after(async () => {
    await server.stopServer();
    delete process.env.PI_STUDIO_AMBIENTES_HOME;
    await rm(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  });
  const call = async (method, route, body) => {
    const response = await fetch(`${base}${route}`, { method, headers: { "x-pi-studio-token": token, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() };
  };

  test("create, list first with its name, rename, remove; invalid input and no token refused", async () => {
    assert.equal((await fetch(`${base}/api/ambientes`)).status, 401);
    assert.equal((await call("POST", "/api/ambientes", { name: "" })).status, 400);
    assert.equal((await call("POST", "/api/ambientes", { name: "x", cwd: "relativa" })).status, 400);
    // A named folder must exist and sit inside the Studio's boundary; only the default folder is ever created.
    const outside = path.join(tmp, "fora-das-raizes");
    await mkdir(outside, { recursive: true });
    assert.equal((await call("POST", "/api/ambientes", { name: "Fora", cwd: outside })).status, 403);
    assert.equal((await call("POST", "/api/ambientes", { name: "Nova", cwd: path.join(roots, "nao-existe") })).status, 400);
    await assert.rejects(stat(path.join(roots, "nao-existe")), "a named folder that does not exist is not created");
    assert.equal((await call("POST", "/api/ambientes", { name: "Rede", cwd: "\\\\servidor\\pasta" })).status, 400);
    const inRoot = await call("POST", "/api/ambientes", { name: "Descoberto", cwd: path.join(roots, "descoberto") });
    assert.equal(inRoot.status, 201);
    assert.equal((await call("DELETE", `/api/ambientes/${inRoot.body.ambiente.id}`)).status, 200);
    const created = await call("POST", "/api/ambientes", { name: "Financeiro BLVR" });
    assert.equal(created.status, 201);
    assert.equal(created.body.project.name, "Financeiro BLVR");
    const projects = (await call("GET", "/api/projects")).body.projects;
    assert.equal(projects[0].ambiente.name, "Financeiro BLVR");
    assert.ok(projects.some((item) => item.name === "descoberto" && !item.ambiente));
    const tree = (await call("GET", "/api/tree")).body;
    assert.equal(tree.projects[0].ambiente.name, "Financeiro BLVR");
    const id = created.body.ambiente.id;
    assert.equal((await call("PATCH", `/api/ambientes/${id}`, { name: "Financeiro" })).body.ambiente.name, "Financeiro");
    assert.equal((await call("GET", "/api/projects")).body.projects[0].name, "Financeiro");
    assert.equal((await call("DELETE", `/api/ambientes/${id}`)).status, 200);
    assert.equal((await call("GET", "/api/ambientes")).body.ambientes.length, 0);
    assert.equal((await call("DELETE", `/api/ambientes/${id}`)).status, 404);
    assert.ok((await stat(created.body.ambiente.cwd)).isDirectory(), "the folder stays");
    const saved = JSON.parse(await readFile(path.join(agentDir, "pi-studio-data", "ambientes.json"), "utf8"));
    assert.deepEqual(saved, []);
  });
});
