import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "../..");
const sandbox = mkdtempSync(path.join(tmpdir(), "chrome-control-smoke-"));
const oldHome = process.env.USERPROFILE;
const oldLocalAppData = process.env.LOCALAPPDATA;
const home = path.join(sandbox, "home");
const localAppData = path.join(sandbox, "local-app-data");
const handlers = new Map();
const tools = new Map();

try {
  const typeboxDir = path.join(sandbox, "node_modules", "typebox");
  mkdirSync(typeboxDir, { recursive: true });
  writeFileSync(path.join(typeboxDir, "package.json"), '{"type":"module","exports":"./index.js"}');
  writeFileSync(path.join(typeboxDir, "index.js"), "export const Type = new Proxy({}, { get: () => (...args) => ({}) });");
  cpSync(path.join(root, "extensions", "chrome-control.ts"), path.join(sandbox, "chrome-control.ts"));
  process.env.USERPROFILE = home;
  process.env.LOCALAPPDATA = localAppData;
  mkdirSync(path.join(localAppData, "Google", "Chrome", "User Data"), { recursive: true });
  const localState = path.join(localAppData, "Google", "Chrome", "User Data", "Local State");
  const localStateContents = JSON.stringify({ profile: { info_cache: { "Profile 1": { name: "Real profile name" }, "Profile 2": { name: "Work" } } } });
  const mod = await import(pathToFileURL(path.join(sandbox, "chrome-control.ts")));

  assert.equal(mod.normalizeProfileName(" QA-Team_1 "), "qa-team_1");
  for (const invalid of ["../escape", "", ".", "a/b", "x".repeat(33), "UPPER SPACE"]) {
    assert.throws(() => mod.normalizeProfileName(invalid));
  }
  assert.deepEqual(mod.listRealChromeProfiles(path.join(sandbox, "missing")), []);
  writeFileSync(localState, localStateContents);
  assert.deepEqual(mod.listRealChromeProfiles(localState), [
    { directory: "Profile 1", name: "Real profile name" },
    { directory: "Profile 2", name: "Work" },
  ]);

  const profileRoot = path.join(home, ".pi", "chrome-profiles");
  const first = mod.createPiProfile("qa-a", profileRoot);
  const second = mod.createPiProfile("qa-b", profileRoot);
  assert.equal(first.directory, path.join(profileRoot, "qa-a"));
  assert.deepEqual(mod.listPiProfiles(profileRoot), ["qa-a", "qa-b"]);
  assert.match(readFileSync(path.join(first.directory, ".pi-chrome-profile.json"), "utf8"), /"owner":"evolvera-pi"/);
  assert.throws(() => mod.createPiProfile("qa-a", profileRoot), /already exists/);
  assert.throws(() => mod.createPiProfile("../outside", profileRoot));
  assert.equal(existsSync(path.join(home, ".pi", "outside")), false);

  const pi = {
    registerTool(tool) { tools.set(tool.name, tool); },
    on(name, handler) { handlers.set(name, handler); },
    events: { emit() { throw new Error("The smoke test must never start or register a browser."); } },
  };
  mod.default(pi);
  const manager = tools.get("chrome_profile_manager");
  assert.ok(manager, "manager tool registered");
  const listed = await manager.execute("test", { action: "list" }, undefined, undefined, {});
  assert.match(listed.content[0].text, /qa-a/);
  assert.match(listed.content[0].text, /qa-b/);
  const created = await manager.execute("test", { action: "create", profile: "qa-c" }, undefined, undefined, {});
  assert.match(created.content[0].text, /qa-c/);
  assert.equal(handlers.has("session_shutdown"), true);
  assert.equal(existsSync(path.join(home, ".pi", "chrome-profiles", "qa-c", ".pi-chrome-profile.json")), true);
  console.log("chrome-control smoke: PASS (synthetic profile metadata; no Chrome process or real profile access)");
} finally {
  if (oldHome === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = oldHome;
  if (oldLocalAppData === undefined) delete process.env.LOCALAPPDATA;
  else process.env.LOCALAPPDATA = oldLocalAppData;
  rmSync(sandbox, { recursive: true, force: true });
}
