import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const require = createRequire(import.meta.url);
const { createJiti } = require(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js") } });

import { spawn } from "node:child_process";

// STATEFUL RESOURCE PROOF: NO_STATEFUL_RESOURCES. Spawns only `sleep` children owned by this test and kills them.
const m = await jiti.import(path.join(root, "extensions/process-reaper.ts"));

assert.deepEqual(m.descendantsOf(1, [{ pid: 2, ppid: 1 }, { pid: 3, ppid: 2 }, { pid: 4, ppid: 9 }, { pid: 5, ppid: 3 }]), [2, 3, 5]);
assert.deepEqual(m.descendantsOf(7, [{ pid: 2, ppid: 1 }]), []);
assert.deepEqual(m.parseProcessTable("  10 1\n11 10\nbad\n"), [{ pid: 10, ppid: 1 }, { pid: 11, ppid: 10 }]);

const handlers = new Map();
m.default({ on: (name, handler) => handlers.set(name, handler) });
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const startTree = async () => {
  const child = spawn("sh", ["-c", "sleep 60 & sleep 60"], { stdio: "ignore" });
  await new Promise((resolve) => setTimeout(resolve, 300));
  return child;
};

const kept = await startTree();
await handlers.get("session_shutdown")({ reason: "quit" }, { mode: "tui" });
await handlers.get("session_shutdown")({ reason: "new" }, { mode: "json" });
assert.ok(alive(kept.pid), "interactive sessions and session replacement leave processes alone");
kept.kill("SIGKILL");

const tree = await startTree();
const grandchildren = (await m.reapDescendants(process.pid)).filter((pid) => pid !== tree.pid);
assert.ok(grandchildren.length >= 1, "grandchildren were found");
await new Promise((resolve) => setTimeout(resolve, 200));
assert.equal(alive(tree.pid), false, "child is gone");
for (const pid of grandchildren) assert.equal(alive(pid), false, "grandchild is gone");
assert.ok(alive(process.pid) && alive(process.ppid), "self and parent survive");

const stubborn = spawn("sh", ["-c", "trap '' TERM; sleep 60 & wait"], { stdio: "ignore" });
await new Promise((resolve) => setTimeout(resolve, 300));
const started = Date.now();
await handlers.get("session_shutdown")({ reason: "quit" }, { mode: "print" });
await new Promise((resolve) => setTimeout(resolve, 200));
assert.equal(alive(stubborn.pid), false, "SIGTERM-ignoring child is SIGKILLed");
assert.ok(Date.now() - started < 5000);
console.log("process-reaper smoke: PASS");
process.exit(0);
