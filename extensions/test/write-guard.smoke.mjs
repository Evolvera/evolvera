import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadJiti } from "./lib/pi-sdk.mjs";

// STATEFUL RESOURCE PROOF: DISPOSABLE_VERIFIED. Only a fresh mkdtemp root is touched and removed.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { createJiti } = await loadJiti(import.meta.url);
const m = await createJiti(import.meta.url, { moduleCache: false }).import(path.join(root, "extensions/write-guard.ts"));

const dir = mkdtempSync(path.join(tmpdir(), "write-guard-"));
try {
  const file = path.join(dir, "source.py");
  writeFileSync(file, "print('work')\n");
  mkdirSync(path.join(dir, "sub"));
  writeFileSync(path.join(dir, "empty.txt"), "");

  const handlers = {};
  m.default({ on: (name, handler) => { handlers[name] = handler; } });
  const call = (input, toolName = "write") => handlers.tool_call({ toolName, input }, { cwd: dir });

  const blocked = await call({ path: file, content: "" });
  assert.equal(blocked.block, true, "empty write over non-empty file is blocked");
  assert.match(blocked.reason, /14-byte file/);
  assert.equal(readFileSync(file, "utf8"), "print('work')\n", "file untouched by the guard");
  assert.equal((await call({ path: "source.py", content: "  \n" })).block, true, "relative path and whitespace-only content");
  assert.equal((await call({ path: "@source.py", content: "" })).block, true, "@-prefixed path");

  for (const [input, label] of [
    [{ path: file, content: "print('new')\n" }, "real content"],
    [{ path: path.join(dir, "new.txt"), content: "" }, "new empty file"],
    [{ path: path.join(dir, "empty.txt"), content: "" }, "already-empty file"],
    [{ path: path.join(dir, "sub"), content: "" }, "directory target"],
  ]) assert.equal(await call(input), undefined, label);
  assert.equal(await call({ path: file, content: "" }, "edit"), undefined, "other tools ignored");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log("write-guard smoke: PASS");
