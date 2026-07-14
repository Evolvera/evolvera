import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "../..");
const sandbox = mkdtempSync(path.join(tmpdir(), "communication-style-smoke-"));

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

try {
  const packageRoot = path.resolve(root, "../../npm-global/lib/node_modules/@earendil-works/pi-coding-agent");
  const scopeDir = path.join(sandbox, "node_modules", "@earendil-works");
  mkdirSync(scopeDir, { recursive: true });
  symlinkSync(packageRoot, path.join(scopeDir, "pi-coding-agent"), "dir");
  cpSync(path.join(root, "extensions", "communication-style.ts"), path.join(sandbox, "communication-style.ts"));
  const mod = await import(pathToFileURL(path.join(sandbox, "communication-style.ts")));

  assert.equal(mod.parseCommunicationMode("default"), "default");
  assert.equal(mod.parseCommunicationMode("default+caveman"), "default+caveman");
  assert.equal(mod.parseCommunicationMode("caveman"), "caveman");
  assert.equal(mod.parseCommunicationMode("verbose"), undefined);

  const agentDir = path.join(sandbox, "agent");
  const project = path.join(sandbox, "project");
  writeJson(path.join(agentDir, "settings.json"), { communicationMode: "default+caveman" });
  writeJson(path.join(project, ".pi", "settings.json"), { communicationMode: "caveman" });

  assert.equal(mod.resolveCommunicationMode(project, false, agentDir), "default+caveman");
  assert.equal(mod.resolveCommunicationMode(project, true, agentDir), "caveman");
  assert.equal(mod.resolveCommunicationMode(path.join(sandbox, "other"), true, agentDir), "default+caveman");

  assert.equal(mod.isPrimaryOrchestratorPrompt("# PI Coding Agent\n\n## Role"), true);
  assert.equal(mod.isPrimaryOrchestratorPrompt("# Builder\n\nImplement one task"), false);
  assert.match(mod.communicationInstruction("default"), /COMMUNICATION MODE: DEFAULT/);
  assert.match(mod.communicationInstruction("default"), /Lead with the conclusion/);
  assert.match(mod.communicationInstruction("default+caveman"), /Resumo caveman:/);
  assert.match(mod.communicationInstruction("caveman"), /COMMUNICATION MODE: CAVEMAN/);

  const handlers = new Map();
  mod.default({
    registerCommand(name, command) {
      handlers.set(`command:${name}`, command.handler);
    },
    on(name, handler) {
      handlers.set(`event:${name}`, handler);
    },
  });
  assert.ok(handlers.has("command:communication-mode"));
  assert.ok(handlers.has("event:before_agent_start"));

  const beforeAgentStart = handlers.get("event:before_agent_start");
  const ctx = { cwd: project, isProjectTrusted: () => true };
  const primaryResult = await beforeAgentStart(
    { systemPrompt: "BASE", systemPromptOptions: { customPrompt: "# PI Coding Agent\n" } },
    ctx,
  );
  assert.match(primaryResult.systemPrompt, /COMMUNICATION MODE: CAVEMAN/);
  const subagentResult = await beforeAgentStart(
    { systemPrompt: "BASE", systemPromptOptions: { customPrompt: "# Builder\n" } },
    ctx,
  );
  assert.equal(subagentResult, undefined);

  console.log("communication-style smoke: PASS");
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
