import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";
import { createTestSymlink } from "./lib/test-symlink.mjs";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "../..");
const sandbox = mkdtempSync(path.join(tmpdir(), "studio-steer-smoke-"));
try {
  const scopeDir = path.join(sandbox, "node_modules", "@earendil-works");
  mkdirSync(scopeDir, { recursive: true });
  createTestSymlink(resolvePiSdkRoot(import.meta.url), path.join(scopeDir, "pi-coding-agent"), "dir");
  const extensionPath = path.join(sandbox, "studio-steer.ts");
  cpSync(path.join(root, "extensions", "studio-steer.ts"), extensionPath);
  const mod = await import(pathToFileURL(extensionPath));
  const handlers = new Map();
  const events = [];
  mod.default({
    registerCommand(name, options) { handlers.set(name, options.handler); },
    events: { emit(name, payload) { events.push({ name, payload }); } },
  });
  const handler = handlers.get("steer");
  assert.equal(typeof handler, "function");
  const notices = [];
  const ctx = { ui: { notify(message, type) { notices.push({ message, type }); } } };

  delete globalThis[Symbol.for("pi-subagents:manager")];
  await handler("agent-1 please continue", ctx);
  assert.equal(notices.at(-1).type, "error");
  assert.match(notices.at(-1).message, /indisponível/);

  globalThis[Symbol.for("pi-subagents:manager")] = { getRecord: () => undefined };
  await handler("missing hello", ctx);
  assert.equal(notices.at(-1).type, "warning");
  assert.match(notices.at(-1).message, /desconhecido/);

  globalThis[Symbol.for("pi-subagents:manager")] = { getRecord: () => ({ id: "stopped", status: "completed" }) };
  await handler("stopped hello", ctx);
  assert.equal(notices.at(-1).type, "warning");
  assert.match(notices.at(-1).message, /não está em execução/);

  const queued = { id: "queued", status: "queued", resultConsumed: true };
  globalThis[Symbol.for("pi-subagents:manager")] = { getRecord: () => queued };
  const eventCountBeforeQueue = events.length;
  await handler("queued  keep going\ncarefully  ", ctx);
  assert.deepEqual(queued.pendingSteers, ["keep going\ncarefully"]);
  assert.equal(queued.resultConsumed, false, "the reply to a steer is relayed again");
  assert.deepEqual(events.at(-1), { name: "subagents:steered", payload: { id: "queued", message: "keep going\ncarefully" } });
  assert.equal(events.length, eventCountBeforeQueue + 1);
  assert.deepEqual(notices.at(-1), { message: "Mensagem enviada ao subagente queued", type: "info" });

  const received = [];
  const running = { id: "running", status: "running", session: { async steer(message) { received.push(message); } } };
  globalThis[Symbol.for("pi-subagents:manager")] = { getRecord: () => running };
  await handler("running message with spaces\nand a newline", ctx);
  assert.deepEqual(received, ["message with spaces\nand a newline"]);
  assert.deepEqual(events.at(-1), { name: "subagents:steered", payload: { id: "running", message: received[0] } });
  assert.deepEqual(notices.at(-1), { message: "Mensagem enviada ao subagente running", type: "info" });

  const beforeEmpty = notices.length;
  await handler("running   \n  ", ctx);
  assert.equal(notices.length, beforeEmpty + 1);
  assert.equal(notices.at(-1).type, "warning");
  assert.match(notices.at(-1).message, /mensagem não pode estar vazia/);
  assert.equal(received.length, 1);

  const broken = { id: "broken", status: "running", session: { async steer() { throw new Error("private detail"); } } };
  globalThis[Symbol.for("pi-subagents:manager")] = { getRecord: () => broken };
  await assert.doesNotReject(handler("broken hello", ctx));
  assert.deepEqual(notices.at(-1), { message: "Não foi possível enviar a mensagem ao subagente.", type: "error" });
  assert.doesNotMatch(notices.at(-1).message, /private detail/);

  delete globalThis[Symbol.for("pi-subagents:manager")];
  console.log("studio-steer smoke: PASS");
} finally {
  delete globalThis[Symbol.for("pi-subagents:manager")];
  rmSync(sandbox, { recursive: true, force: true });
}
