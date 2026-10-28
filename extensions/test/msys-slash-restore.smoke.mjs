import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

// STATEFUL RESOURCE PROOF: DISPOSABLE_VERIFIED. Unit cases are in-memory; the Git Bash probe only echoes an
// env var through a child node; the real AgentSession uses a fresh mkdtemp root removed in finally and a faux
// provider with synthetic credentials. No network or PI process.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const require = createRequire(import.meta.url);
const { createJiti } = require(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js") } });
const extPath = path.join(root, "extensions/msys-slash-restore.ts");
const m = await jiti.import(extPath);

// ── unit ──
const roots = m.msysRoots({ ProgramFiles: "C:\\Program Files", "ProgramFiles(x86)": "C:\\Program Files (x86)", ProgramW6432: "C:\\Program Files", LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local\\" });
assert.deepEqual(roots, ["C:/Program Files/Git", "C:/Program Files (x86)/Git", "C:/Users/u/AppData/Local/Programs/Git"], "deduped, forward slashes, no trailing slash");
assert.deepEqual(m.msysRoots({}), []);
assert.deepEqual(m.msysRoots({ ProgramFiles: "", LOCALAPPDATA: "\\" }), []);
assert.equal(m.restoreMangledSlash("C:/Program Files/Git/fast ultra", roots), "/fast ultra");
assert.equal(m.restoreMangledSlash("c:/program files/git/skill:scout go", roots), "/skill:scout go", "drive/path case-insensitive");
assert.equal(m.restoreMangledSlash("C:/Users/u/AppData/Local/Programs/Git/reload", roots), "/reload");
assert.equal(m.restoreMangledSlash("fix C:/Program Files/Git/fast", roots), undefined, "only a leading mangle");
assert.equal(m.restoreMangledSlash("C:/Program Files/Git/", roots), undefined);
assert.equal(m.restoreMangledSlash("C:/Program Files/Git/ x", roots), undefined);
assert.equal(m.restoreMangledSlash("C:/Program Files/Git//x", roots), undefined);
assert.equal(m.restoreMangledSlash("C:/Program Files/Github/x", roots), undefined, "a sibling folder is not the root");
assert.equal(m.restoreMangledSlash("/fast ultra", roots), undefined, "intact input untouched");

// ── unit: input routing ──
{
  const handlers = new Map();
  const commands = [{ name: "fast", source: "extension" }, { name: "review", source: "prompt" }, { name: "skill:scout", source: "skill" }];
  m.default({ on: (name, handler) => handlers.set(name, handler), getCommands: () => commands });
  const editor = []; const notices = [];
  const ui = { setEditorText: (text) => editor.push(text), notify: (text, level) => notices.push({ text, level }) };
  const input = (text, hasUI = true) => handlers.get("input")({ text, source: "interactive" }, { hasUI, ui });
  const pf = process.env.ProgramFiles ? `${process.env.ProgramFiles.replace(/\\/g, "/")}/Git` : undefined;
  if (pf) {
    assert.deepEqual(await input(`${pf}/fast ultra`), { action: "handled" }, "extension command goes back to the editor");
    assert.deepEqual(editor, ["/fast ultra"]);
    assert.equal(notices[0].level, "warning");
    assert.match(notices[0].text, /\/fast ultra/);
    assert.deepEqual(await input(`${pf}/model x`), { action: "handled" }, "built-in/unknown command goes back to the editor");
    assert.deepEqual(await input(`${pf}/review now`), { action: "transform", text: "/review now" }, "templates expand after transform");
    assert.deepEqual(await input(`${pf}/skill:scout go`), { action: "transform", text: "/skill:scout go" }, "skills expand after transform");
    assert.deepEqual(await input(`${pf}/fast ultra`, false), { action: "transform", text: "/fast ultra" }, "no UI: restore text");
  }
  assert.equal(await input("plain prompt"), undefined);
  assert.equal(editor.length, pf ? 2 : 0);
}

// ── real Git Bash mangling of ORCA_PI_PREFILL, fixed at extension load ──
if (process.platform === "win32") {
  const bash = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean).map((base) => path.join(base, "Git", "bin", "bash.exe")).find((p) => fs.existsSync(p));
  if (bash) {
    const seen = execFileSync(bash, ["-c", `ORCA_PI_PREFILL="/fast ultra" "${process.execPath.replace(/\\/g, "/")}" -e "console.log(process.env.ORCA_PI_PREFILL)"`], { encoding: "utf8" }).trim();
    assert.notEqual(seen, "/fast ultra", `Git Bash mangles the env value (precondition), got ${seen}`);
    assert.match(seen, /\/Git\/fast ultra$/);
    const previous = process.env[m.PREFILL_ENV];
    process.env[m.PREFILL_ENV] = seen;
    m.default({ on() {}, getCommands: () => [] });
    assert.equal(process.env[m.PREFILL_ENV], "/fast ultra", "prefill restored before Orca copies it into the editor");
    process.env[m.PREFILL_ENV] = "normal draft";
    m.default({ on() {}, getCommands: () => [] });
    assert.equal(process.env[m.PREFILL_ENV], "normal draft");
    if (previous === undefined) delete process.env[m.PREFILL_ENV]; else process.env[m.PREFILL_ENV] = previous;
  }
}

// ── integration: real AgentSession with /fast registered by codex-fast-mode ──
const home = fs.mkdtempSync(path.join(os.tmpdir(), "msys-slash-smoke-"));
const saved = Object.fromEntries(["JITI_FS_CACHE", "PI_CODING_AGENT_DIR"].map((key) => [key, process.env[key]]));
process.env.PI_CODING_AGENT_DIR = home;
process.env.JITI_FS_CACHE = "0";
let session;
try {
  const sdk = await import(pathToFileURL(path.join(sdkRoot, "dist/index.js")).href);
  const { loadExtensions } = await import(pathToFileURL(path.join(sdkRoot, "dist/core/extensions/loader.js")).href);
  const faux = await import(pathToFileURL(path.join(sdkRoot, "node_modules/@earendil-works/pi-ai/dist/providers/faux.js")).href);
  const modelCore = faux.createFauxCore({ models: [{ id: "msys-test", contextWindow: 16_000, maxTokens: 512 }] });
  const modelRuntime = await sdk.ModelRuntime.create({ authPath: path.join(home, "auth.json"), modelsPath: null });
  modelRuntime.registerProvider(modelCore.provider, { api: modelCore.api, streamSimple: modelCore.streamSimple, apiKey: "synthetic-only", baseUrl: "http://127.0.0.1:9", models: modelCore.models.map((item) => ({ ...item })) });
  const loaded = await loadExtensions([extPath, path.join(root, "extensions/codex-fast-mode.ts")], home);
  assert.deepEqual(loaded.errors, []);
  const resourceLoader = {
    getExtensions: () => loaded, getSkills: () => ({ skills: [], diagnostics: [] }), getPrompts: () => ({ prompts: [], diagnostics: [] }), getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }), getSystemPrompt: () => "Synthetic test only.", getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [], getAppendSystemPromptSources: () => [], extendResources: () => {}, reload: async () => {},
  };
  const { session: created } = await sdk.createAgentSession({ cwd: home, agentDir: home, model: modelCore.models[0], thinkingLevel: "off", modelRuntime, resourceLoader, sessionManager: sdk.SessionManager.inMemory(home), tools: [],
    settingsManager: sdk.SettingsManager.inMemory({ retry: { enabled: false } }) });
  session = created;
  const editor = []; const notices = [];
  session.extensionRunner.setUIContext({ setEditorText: (t) => editor.push(t), notify: (t) => notices.push(t), setStatus() {} }, "tui");
  const pf = process.env.ProgramFiles?.replace(/\\/g, "/");
  if (pf) {
    await session.prompt(`${pf}/Git/fast ultra`);
    assert.deepEqual(editor, ["/fast ultra"], "mangled command is restored to the editor");
    assert.equal(session.agent.state.messages.length, 0, "the mangled command never reaches the model");
    await session.prompt(editor[0]);
    assert.ok(notices.some((t) => /Ultrafast|Fast Mode ULTRA/.test(t)), `restored command runs: ${JSON.stringify(notices)}`);
    assert.equal(session.agent.state.messages.length, 0);
  }
} finally {
  session?.dispose();
  for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  fs.rmSync(home, { recursive: true, force: true });
}
console.log("msys-slash-restore smoke: PASS");
