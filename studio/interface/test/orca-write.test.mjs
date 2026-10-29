// Studio -> Orca writes (board column, comment, PI terminal) use only the fake CLI and a run-owned temporary directory.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import * as lib from "../public/lib.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = await mkdtemp(path.join(os.tmpdir(), "pi-studio-orca-write-"));
const agentDir = path.join(tmp, "agent");
const roots = path.join(tmp, "roots");
const projectDir = path.join(roots, "project");
const orcaState = path.join(tmp, "orca.json");
const argvFile = path.join(tmp, "argv.jsonl");
await mkdir(projectDir, { recursive: true });
await writeFile(path.join(projectDir, "package.json"), "{}");
const worktreeId = `fake-repo::${projectDir}`;
const initialState = { mode: "normal", worktrees: [{ path: projectDir, repoId: "repo-1", workspaceStatus: "todo" }] };
await writeFile(orcaState, JSON.stringify(initialState));

Object.assign(process.env, { PI_WEB_HOST: "127.0.0.1", PI_WEB_PORT: "0", PI_AGENT_DIR: agentDir, PI_PROJECT_ROOTS: roots,
  PI_WEB_PI_BIN: process.execPath, PI_WEB_PI_BIN_ARGS: JSON.stringify([path.join(here, "fake-pi-rpc.mjs")]),
  PI_STUDIO_ORCA_BIN: process.execPath, PI_STUDIO_ORCA_BIN_ARGS: JSON.stringify([path.join(here, "fake-orca.mjs")]),
  PI_STUDIO_ORCA_TIMEOUT_MS: "6000", FAKE_ORCA_STATE: orcaState, FAKE_ORCA_ARGV_FILE: argvFile });
const server = await import("../server.mjs");
let base;
let token;
const request = async (method, route, body, headers = {}) => {
  const response = await fetch(`${base}${route}`, { method, headers: { "x-pi-studio-token": token, ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
};
const argvLines = async () => (await readFile(argvFile, "utf8").catch(() => "")).trim().split("\n").filter(Boolean).map(JSON.parse);

before(async () => {
  const running = await server.startServer(0, "127.0.0.1");
  base = `http://127.0.0.1:${running.address().port}`;
  token = (await (await fetch(base)).text()).match(/name="pi-studio-token" content="([a-f0-9]+)"/)[1];
});
after(async () => {
  await server.stopServer();
  await rm(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

describe("Orca write arguments (pure)", () => {
  test("worktree set takes a board column and/or a one-line comment, never another flag", () => {
    assert.deepEqual(lib.orcaWorktreeSetArgs({ worktreeId: "r::C:/w", workspaceStatus: "in-review" }), ["worktree", "set", "--worktree=id:r::C:/w", "--workspace-status=in-review", "--json"]);
    assert.deepEqual(lib.orcaWorktreeSetArgs({ worktreeId: "r::/w", comment: "--force é texto" }), ["worktree", "set", "--worktree=id:r::/w", "--comment=--force é texto", "--json"]);
    for (const bad of [{}, { worktreeId: "r::/w" }, { worktreeId: "", workspaceStatus: "todo" }, { worktreeId: "a\nb", workspaceStatus: "todo" },
      { worktreeId: "r::/w", workspaceStatus: "Todo" }, { worktreeId: "r::/w", workspaceStatus: "--x" }, { worktreeId: "r::/w", comment: "a\nb" }, { worktreeId: "r::/w", comment: "x".repeat(201) }]) {
      assert.throws(() => lib.orcaWorktreeSetArgs(bad), /invalid/, JSON.stringify(bad));
    }
  });

  test("PI terminal opens `pi` in that worktree and focuses it", () => {
    assert.deepEqual(lib.orcaPiTerminalArgs({ worktreeId: "r::/w" }), ["terminal", "create", "--worktree=id:r::/w", "--title=PI", "--command=pi", "--focus", "--json"]);
    assert.throws(() => lib.orcaPiTerminalArgs({}), /invalid/);
  });

  test("board options: default columns, the current one selected, a custom column kept, a placeholder when none", () => {
    assert.deepEqual(lib.orcaBoardOptions("in-review").filter((o) => o.selected).map((o) => o.id), ["in-review"]);
    assert.deepEqual(lib.orcaBoardOptions("qa").map((o) => o.id), ["todo", "in-progress", "in-review", "completed", "qa"]);
    assert.deepEqual(lib.orcaBoardOptions("")[0], { id: "", label: "Sem coluna", selected: true, disabled: true });
    assert.equal(lib.orcaWriteFeedback(new Error("worktree-not-in-orca")), "O Orca não lista mais esta worktree.");
    assert.match(lib.orcaWriteFeedback(new Error("x")), /não concluiu o pedido: x/);
  });

  test("normalizeOrca keeps the board column", () => {
    const summary = lib.normalizeOrca({ ok: true, result: { worktrees: [{ path: "/w", workspaceStatus: "in-progress" }] } });
    assert.equal(summary.worktrees[0].workspaceStatus, "in-progress");
  });
});

describe("Orca write routes", () => {
  test("worktree-set moves the worktree on Orca's board and the next /api/orca shows it", async () => {
    assert.equal((await request("GET", "/api/orca")).body.worktrees[0].workspaceStatus, "todo");
    const moved = await request("POST", "/api/orca/worktree-set", { worktreeId, workspaceStatus: "in-review" });
    assert.deepEqual(moved, { status: 200, body: { ok: true } });
    assert.deepEqual((await argvLines()).at(-1), ["worktree", "set", `--worktree=id:${worktreeId}`, "--workspace-status=in-review", "--json"]);
    assert.equal((await request("GET", "/api/orca")).body.worktrees[0].workspaceStatus, "in-review");
    assert.equal((await request("POST", "/api/orca/worktree-set", { worktreeId, comment: "revisar o login" })).status, 200);
    assert.equal((await request("GET", "/api/orca")).body.worktrees[0].comment, "revisar o login");
  });

  test("pi-terminal opens a PI terminal in a listed worktree", async () => {
    assert.deepEqual(await request("POST", "/api/orca/pi-terminal", { worktreeId }), { status: 200, body: { ok: true } });
    assert.deepEqual((await argvLines()).at(-1), ["terminal", "create", `--worktree=id:${worktreeId}`, "--title=PI", "--command=pi", "--focus", "--json"]);
  });

  test("only worktrees Orca lists now, valid bodies, POST, token; Orca closed is 503", async () => {
    const before = (await argvLines()).length;
    assert.equal((await request("POST", "/api/orca/pi-terminal", { worktreeId: "fake-repo::/elsewhere" })).status, 409);
    assert.equal((await request("POST", "/api/orca/worktree-set", { worktreeId, workspaceStatus: "Bad Status" })).status, 400);
    assert.equal((await request("POST", "/api/orca/worktree-set", { worktreeId })).status, 400);
    assert.equal((await request("GET", "/api/orca/pi-terminal")).status, 405);
    assert.equal((await fetch(`${base}/api/orca/pi-terminal`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ worktreeId }) })).status, 401);
    // Only `worktree ps` ran for the rejected requests: nothing was written to Orca.
    assert.ok((await argvLines()).slice(before).every((argv) => argv[0] === "worktree" && argv[1] === "ps"));
    await writeFile(orcaState, JSON.stringify({ ...initialState, mode: "exit" }));
    assert.deepEqual(await request("POST", "/api/orca/pi-terminal", { worktreeId }), { status: 503, body: { error: "orca-unavailable" } });
    await writeFile(orcaState, JSON.stringify(initialState));
    server.clearOrcaCache();
  });
});
