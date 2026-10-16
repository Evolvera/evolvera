import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createAccount, inspectSessionBinding, selectSessionAccount } from "../users/account-session.mjs";
import { listUsers, registerUser } from "../users/registry.mjs";

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "pi-account-session-"));
const REGISTRY = path.join(ROOT, "registry", "users.json");
const RESOURCE_MANIFEST = path.join(ROOT, "resource-manifest.json");
const sentinel = path.join(ROOT, "shared", "sentinel.json");
fs.mkdirSync(path.dirname(sentinel), { recursive: true });
fs.writeFileSync(sentinel, JSON.stringify({ cwd: "shared-cwd", settings: "shared-settings", history: "shared-history", memory: "shared-memory" }));
const protectedFiles = [
  ["SDK package", "C:/Users/kevin/AppData/Local/nvm/v24.20.0/node_modules/@earendil-works/pi-coding-agent/package.json", "d4231a02b6a2ccb357a8e9e420fab9c217490137ade958d4a45a12e169daad0c"],
  ["SDK main", "C:/Users/kevin/AppData/Local/nvm/v24.20.0/node_modules/@earendil-works/pi-coding-agent/dist/main.js", "f4e68ceeeb8ddfd905662d2c55497fea8ccdf252a83a2ca14233ec872d742016"],
  ["SDK model runtime", "C:/Users/kevin/AppData/Local/nvm/v24.20.0/node_modules/@earendil-works/pi-coding-agent/dist/core/model-runtime.js", "578b742bea061fed029b8e139c6c0bcfe31e60665e9c0c6a08769761ef169dfd"],
  ["SDK runtime types", "C:/Users/kevin/AppData/Local/nvm/v24.20.0/node_modules/@earendil-works/pi-coding-agent/dist/core/model-runtime.d.ts", "5a7aac47a83c20316f593c74798f60ec4e521a0fddff03a0608dbc5514012bf5"],
  ["SDK services", "C:/Users/kevin/AppData/Local/nvm/v24.20.0/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session-services.js", "20b7aa4b0657b53fb522ea051df26f72901802e03cc06c89e0a8926388bca601"],
  ["protected selector", "C:/Users/kevin/Documents/Pi/scripts/patch-pi-101-interactive-activity.mjs", "e47429c2e2c20393cc57fa561b897ad126d0008994ca36d75779d7a0b9e1f48f"],
  ["protected selector smoke", "C:/Users/kevin/Documents/Pi/scripts/test/patch-pi-101-interactive-activity.smoke.mjs", "075f4e8450f97560d60d00be20cd91e45808306ce40beccb09f42be577ca4423"],
];
const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sourceBefore = protectedFiles.map(([name, file, expected]) => {
  if (name.startsWith("protected selector") && !fs.existsSync(file)) return { name, file, expected, absent: true };
  const actual = hash(file);
  assert.equal(actual, expected, `${name} baseline hash changed before test`);
  return { name, file, expected, before: actual };
});

let nextSessionId = 0;
class NativeShapedSessionManager {
  constructor({ entries = [], file, persist = false, conversation = false, sessionId } = {}) {
    const copied = entries.map((entry) => structuredClone(entry));
    this.header = copied.find((entry) => entry.type === "session") ?? { type: "session", version: 3, id: sessionId ?? `synthetic-${++nextSessionId}`, cwd: "shared-cwd" };
    this.sessionId = sessionId ?? this.header.id;
    this.entries = copied.filter((entry) => entry.type !== "session");
    this.file = file;
    this.persist = persist;
    this.flushed = fs.existsSync(file ?? "") && persist;
    this.conversation = conversation;
  }
  getEntries() { return this.entries.filter((entry) => entry.type !== "session"); }
  getSessionFile() { return this.file; }
  getSessionId() { return this.sessionId; }
  getHeader() { return this.header; }
  isPersisted() { return this.persist; }
  appendCustomEntry(customType, data) {
    this.operations?.push("append-binding");
    const entry = { type: "custom", customType, data: structuredClone(data), id: `e${this.entries.length + 1}`, parentId: this.entries.at(-1)?.id ?? null, timestamp: "synthetic" };
    this.entries.push(entry);
    this.persistEntry(entry);
    return entry.id;
  }
  appendMessage() {
    const entry = { type: "message", id: `m${this.entries.length + 1}`, parentId: this.entries.at(-1)?.id ?? null, timestamp: "synthetic", message: { role: "user", content: "synthetic" } };
    this.entries.push(entry);
    this.conversation = true;
    this.persistEntry(entry);
    return entry.id;
  }
  persistEntry(entry) {
    if (!this.persist || !this.file) return;
    if (!this.flushed) {
      if (!this.conversation) return;
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.appendFileSync(this.file, [this.header, ...this.entries].map((value) => `${JSON.stringify(value)}\n`).join(""));
      this.flushed = true;
    } else fs.appendFileSync(this.file, `${JSON.stringify(entry)}\n`);
  }
  contextMessages() { return this.getEntries().filter((entry) => entry.type === "message").map((entry) => entry.message); }
  getBranch(fromId = this.leaf) {
    const byId = new Map(this.getEntries().map((entry) => [entry.id, entry]));
    const branch = [];
    let current = byId.get(fromId);
    while (current) { branch.push(current); current = byId.get(current.parentId); }
    return branch.reverse();
  }
  branch(leafId) { this.leaf = leafId; return this.getBranch(leafId); }
  forkAt(leafId) {
    const entries = this.getBranch(leafId).map((entry, index) => ({ ...structuredClone(entry), id: `fork${index + 1}`, parentId: index ? `fork${index}` : null }));
    return new NativeShapedSessionManager({ entries });
  }
  forkInPlace(leafId) {
    const previousSessionFile = this.file;
    this.entries = this.getBranch(leafId);
    this.sessionId = `synthetic-reset-${++nextSessionId}`;
    this.header = { type: "session", version: 3, id: this.sessionId, cwd: "shared-cwd" };
    this.flushed = false;
    return previousSessionFile;
  }
}
function bindEntry(id, overrides = {}) {
  return { type: "custom", customType: "pi.account", data: { version: 1, accountId: id }, id: `b-${id}`, parentId: null, timestamp: "synthetic", ...overrides };
}
function setupAccounts() {
  for (const id of ["alpha", "bravo", "charlie"]) {
    registerUser({ registryPath: REGISTRY, id, label: id, agentDir: path.join(ROOT, "profiles", id, "agent"), sessionRoots: [path.join(ROOT, "sessions", id)] });
  }
}
setupAccounts();

test("generic registry selection; target session binding beats wrong picker and hints", async () => {
  const manager = new NativeShapedSessionManager({ entries: [bindEntry("bravo"), { type: "message", id: "m1", message: { role: "user", content: "hello" } }] });
  let pickerCalls = 0;
  const selected = await selectSessionAccount({ registryPath: REGISTRY, sessionManager: manager, pickAccount: () => { pickerCalls++; return "alpha"; }, lastAccount: "charlie", provider: "wrong" });
  assert.equal(selected.id, "bravo");
  assert.equal(pickerCalls, 0);
  assert.deepEqual(listUsers({ registryPath: REGISTRY }).map((user) => user.id), ["alpha", "bravo", "charlie"]);
  assert.deepEqual(manager.contextMessages().map((message) => message.role), ["user"]);
});

test("async picker completes before binding and async cancellation/rejection writes nothing", async () => {
  const manager = new NativeShapedSessionManager();
  manager.operations = [];
  let release;
  let pickerStarted;
  const started = new Promise((resolve) => { pickerStarted = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const pending = selectSessionAccount({ registryPath: REGISTRY, sessionManager: manager, pickAccount: async (users) => {
    assert.equal(users.length, 3);
    manager.operations.push("picker-start");
    pickerStarted();
    await gate;
    return "alpha";
  } });
  await started;
  assert.deepEqual(manager.operations, ["picker-start"]);
  assert.equal(manager.getEntries().some((entry) => entry.customType === "pi.account"), false);
  release();
  assert.equal((await pending).id, "alpha");
  assert.deepEqual(manager.operations, ["picker-start", "append-binding"]);

  const cancelled = new NativeShapedSessionManager();
  await assert.rejects(selectSessionAccount({ registryPath: REGISTRY, sessionManager: cancelled, pickAccount: async () => null }), { code: "ACCOUNT_SELECTION_CANCELLED" });
  assert.equal(cancelled.getEntries().some((entry) => entry.customType === "pi.account"), false);
  const rejection = new Error("synthetic picker rejection");
  const rejected = new NativeShapedSessionManager();
  await assert.rejects(selectSessionAccount({ registryPath: REGISTRY, sessionManager: rejected, pickAccount: async () => { throw rejection; } }), (error) => error === rejection);
  assert.equal(rejected.getEntries().some((entry) => entry.customType === "pi.account"), false);
});

test("legacy session gets one durable binding and reload does not reprompt", async () => {
  const file = path.join(ROOT, "sessions", "legacy.jsonl");
  const first = new NativeShapedSessionManager({ file, persist: true, conversation: true, entries: [{ type: "session", version: 3, id: "legacy", cwd: "shared-cwd" }, { type: "message", id: "m1", message: { role: "user", content: "hello" } }] });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, [first.header, ...first.entries].map((entry) => `${JSON.stringify(entry)}\n`).join(""));
  first.flushed = true;
  let calls = 0;
  assert.equal((await selectSessionAccount({ registryPath: REGISTRY, sessionManager: first, pickAccount: (users) => { calls++; assert.equal(users.length, 3); return "alpha"; } })).id, "alpha");
  assert.equal(calls, 1);
  const reloaded = new NativeShapedSessionManager({ file, persist: true, conversation: true, entries: fs.readFileSync(file, "utf8").trim().split("\n").map(JSON.parse) });
  assert.equal((await selectSessionAccount({ registryPath: REGISTRY, sessionManager: reloaded, pickAccount: () => { calls++; return "charlie"; } })).id, "alpha");
  assert.equal(calls, 1);
  const stored = fs.readFileSync(file, "utf8").trim().split("\n").map(JSON.parse).filter((entry) => entry.customType === "pi.account");
  assert.deepEqual(stored.map((entry) => entry.data), [{ version: 1, accountId: "alpha" }]);
  assert.deepEqual(reloaded.contextMessages().map((message) => message.role), ["user"]);
});

test("fresh deferred persistence and in-memory sessions associate without creating a session file", async () => {
  const file = path.join(ROOT, "sessions", "fresh.jsonl");
  const fresh = new NativeShapedSessionManager({ file, persist: true });
  assert.equal((await selectSessionAccount({ registryPath: REGISTRY, sessionManager: fresh, pickAccount: () => "charlie" })).id, "charlie");
  assert.equal(fs.existsSync(file), false, "custom binding alone must remain deferred");
  fresh.appendMessage();
  assert.deepEqual(fs.readFileSync(file, "utf8").trim().split("\n").map(JSON.parse).filter((entry) => entry.customType === "pi.account")[0].data, { version: 1, accountId: "charlie" });
  const memory = new NativeShapedSessionManager();
  assert.equal((await selectSessionAccount({ registryPath: REGISTRY, sessionManager: memory, pickAccount: () => "alpha" })).id, "alpha");
  assert.equal(memory.getSessionFile(), undefined);
});

test("persisted setup-only entries and binding remain deferred across repeat selection and replacement", async () => {
  const predecessorFile = path.join(ROOT, "sessions", "deferred-parent.jsonl");
  const predecessor = new NativeShapedSessionManager({ file: predecessorFile, persist: true, entries: [
    { type: "model_change", id: "model-1", parentId: null, provider: "synthetic", modelId: "model" },
    { type: "thinking_level_change", id: "thinking-1", parentId: "model-1", thinkingLevel: "high" },
  ] });
  let calls = 0;
  assert.equal((await selectSessionAccount({ registryPath: REGISTRY, sessionManager: predecessor, pickAccount: async () => { calls++; return "bravo"; } })).id, "bravo");
  assert.equal(fs.existsSync(predecessorFile), false);
  assert.equal((await selectSessionAccount({ registryPath: REGISTRY, sessionManager: predecessor, pickAccount: async () => { calls++; return "alpha"; } })).id, "bravo");
  assert.equal(calls, 1);
  assert.equal(fs.existsSync(predecessorFile), false, "selection must not create or rewrite a deferred file");
  assert.equal((fs.existsSync(path.dirname(predecessorFile)) ? fs.readdirSync(path.dirname(predecessorFile)) : []).some((name) => name.startsWith("deferred-")), false);

  for (const reason of ["new", "fork"]) {
    const replacementFile = path.join(ROOT, "sessions", `deferred-${reason}.jsonl`);
    const replacement = new NativeShapedSessionManager({ file: replacementFile, persist: true });
    assert.equal((await selectSessionAccount({ registryPath: REGISTRY, sessionManager: replacement,
      sessionStartEvent: { type: "session_start", reason, previousSessionFile: predecessorFile },
      predecessorSessionManager: predecessor, pickAccount: async () => { calls++; return "charlie"; } })).id, "bravo");
    assert.equal(fs.existsSync(replacementFile), false);
  }
  assert.equal(calls, 1);

  const missingConversation = new NativeShapedSessionManager({ file: path.join(ROOT, "sessions", "missing-conversation.jsonl"), persist: true, entries: [
    { type: "message", id: "user-1", parentId: null, message: { role: "user", content: "already conversational" } },
  ] });
  await assert.rejects(selectSessionAccount({ registryPath: REGISTRY, sessionManager: missingConversation, pickAccount: async () => { assert.fail("missing conversation file reached picker"); } }), { code: "ACCOUNT_SESSION_UNDECIDABLE" });
  assert.equal(fs.existsSync(missingConversation.getSessionFile()), false);
});

test("all-entry binding authority includes off-branch entries and conflicting off-branch data fails closed", () => {
  const manager = new NativeShapedSessionManager({ entries: [bindEntry("alpha"), { type: "message", id: "m1", message: { role: "user", content: "one" } }, bindEntry("bravo", { id: "off-branch", parentId: "missing" })] });
  manager.branch("m1");
  assert.throws(() => inspectSessionBinding({ registryPath: REGISTRY, sessionManager: manager }), { code: "ACCOUNT_BINDING_CONFLICT" });
  const single = new NativeShapedSessionManager({ entries: [bindEntry("bravo"), { type: "message", id: "m1", message: { role: "user", content: "one" } }] });
  single.branch("m1");
  assert.equal(inspectSessionBinding({ registryPath: REGISTRY, sessionManager: single }).id, "bravo");
});

test("explicit predecessor authority applies only to native new/fork replacement and conflicts are rejected", async () => {
  const predecessor = new NativeShapedSessionManager({ entries: [{ type: "message", id: "m1", parentId: null, message: { role: "user", content: "old" } }] });
  assert.equal((await selectSessionAccount({ registryPath: REGISTRY, sessionManager: predecessor, pickAccount: () => "bravo" })).id, "bravo");
  const forkBeforeBinding = predecessor.forkAt("m1");
  assert.equal(forkBeforeBinding.getEntries().some((entry) => entry.customType === "pi.account"), false);
  assert.equal((await selectSessionAccount({ registryPath: REGISTRY, sessionManager: forkBeforeBinding, sessionStartEvent: { type: "session_start", reason: "fork" }, predecessorSessionManager: predecessor, pickAccount: () => "charlie" })).id, "bravo");
  for (const reason of ["new", "fork"]) {
    const replacement = new NativeShapedSessionManager();
    assert.equal((await selectSessionAccount({ registryPath: REGISTRY, sessionManager: replacement, sessionStartEvent: { type: "session_start", reason }, predecessorSessionManager: predecessor, pickAccount: () => "charlie" })).id, "bravo");
  }
  const resume = new NativeShapedSessionManager();
  assert.equal((await selectSessionAccount({ registryPath: REGISTRY, sessionManager: resume, sessionStartEvent: { type: "session_start", reason: "resume" }, predecessorSessionManager: predecessor, pickAccount: () => "charlie" })).id, "charlie");
  const conflicting = new NativeShapedSessionManager({ entries: [bindEntry("alpha")] });
  await assert.rejects(selectSessionAccount({ registryPath: REGISTRY, sessionManager: conflicting, sessionStartEvent: { type: "session_start", reason: "fork" }, predecessorSessionManager: predecessor, pickAccount: () => "charlie" }), { code: "ACCOUNT_BINDING_CONFLICT" });
});

test("native in-memory fork may reuse the same manager only after an identity-verified reset", async () => {
  const manager = new NativeShapedSessionManager({ entries: [
    { type: "message", id: "fork-root", parentId: null, message: { role: "user", content: "before binding" } },
  ] });
  assert.equal((await selectSessionAccount({ registryPath: REGISTRY, sessionManager: manager, pickAccount: async () => "alpha" })).id, "alpha");
  const oldId = manager.getSessionId();
  const oldFile = manager.forkInPlace("fork-root");
  assert.notEqual(manager.getSessionId(), oldId);
  assert.equal(manager.getEntries().some((entry) => entry.customType === "pi.account"), false);
  assert.equal((await selectSessionAccount({ registryPath: REGISTRY, sessionManager: manager, predecessorSessionManager: manager,
    sessionStartEvent: { type: "session_start", reason: "fork", previousSessionFile: oldFile },
    pickAccount: async () => { assert.fail("verified same-manager fork must inherit without prompting"); } })).id, "alpha");
  assert.equal(manager.getEntries().filter((entry) => entry.customType === "pi.account").length, 1);

  const unchanged = new NativeShapedSessionManager({ entries: [{ type: "message", id: "unchanged-root", parentId: null, message: { role: "user", content: "before binding" } }] });
  await selectSessionAccount({ registryPath: REGISTRY, sessionManager: unchanged, pickAccount: async () => "alpha" });
  unchanged.entries = unchanged.entries.filter((entry) => entry.customType !== "pi.account");
  await assert.rejects(selectSessionAccount({ registryPath: REGISTRY, sessionManager: unchanged, predecessorSessionManager: unchanged,
    sessionStartEvent: { type: "session_start", reason: "fork", previousSessionFile: undefined },
    pickAccount: async () => "bravo" }), { code: "ACCOUNT_BINDING_CONFLICT" });

  const forged = new NativeShapedSessionManager({ entries: [{ type: "message", id: "forged-root", parentId: null, message: { role: "user", content: "before binding" } }] });
  await selectSessionAccount({ registryPath: REGISTRY, sessionManager: forged, pickAccount: async () => "bravo" });
  forged.forkInPlace("forged-root");
  await assert.rejects(selectSessionAccount({ registryPath: REGISTRY, sessionManager: forged, predecessorSessionManager: forged,
    sessionStartEvent: { type: "session_start", reason: "fork", previousSessionFile: "forged-old-path" },
    pickAccount: async () => "charlie" }), { code: "ACCOUNT_BINDING_CONFLICT" });
  const unassociated = new NativeShapedSessionManager();
  assert.equal((await selectSessionAccount({ registryPath: REGISTRY, sessionManager: unassociated,
    sessionStartEvent: { type: "session_start", reason: "new" }, predecessorSessionManager: new NativeShapedSessionManager(),
    pickAccount: async () => "charlie" })).id, "charlie");
});

test("invalid, conflicting, unknown, malformed, and raw-parser-skipped binding metadata fails before picker", async () => {
  const cases = [
    ["unknown-version", [bindEntry("alpha", { data: { version: 2, accountId: "alpha" } })], "ACCOUNT_BINDING_MALFORMED"],
    ["extra-key", [bindEntry("alpha", { data: { version: 1, accountId: "alpha", extra: true } })], "ACCOUNT_BINDING_MALFORMED"],
    ["empty-id", [bindEntry("alpha", { data: { version: 1, accountId: "" } })], "ACCOUNT_BINDING_MALFORMED"],
    ["unknown-id", [bindEntry("unknown")], "ACCOUNT_BINDING_UNKNOWN"],
    ["wrong-entry-type", [{ ...bindEntry("alpha"), type: "custom_message" }], "ACCOUNT_BINDING_MALFORMED"],
    ["conflicting", [bindEntry("alpha"), bindEntry("bravo", { id: "other" })], "ACCOUNT_BINDING_CONFLICT"],
  ];
  for (const [name, entries, code] of cases) {
    const manager = new NativeShapedSessionManager({ entries });
    await assert.rejects(selectSessionAccount({ registryPath: REGISTRY, sessionManager: manager, pickAccount: () => { assert.fail(`${name} reached picker`); } }), { code }, name);
  }
  const file = path.join(ROOT, "sessions", "skipped-corruption.jsonl");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ type: "session", id: "bad", cwd: "shared-cwd" })}\nnot-json\n`);
  const nativeLoaded = new NativeShapedSessionManager({ file, persist: true, entries: [{ type: "session", id: "bad", cwd: "shared-cwd" }] });
  await assert.rejects(selectSessionAccount({ registryPath: REGISTRY, sessionManager: nativeLoaded, pickAccount: () => { assert.fail("corruption reached picker"); } }), { code: "ACCOUNT_SESSION_UNDECIDABLE" });
});

test("persisted raw session identity and binding must match the loaded native manager", () => {
  const headerFile = path.join(ROOT, "sessions", "raw-header-mismatch.jsonl");
  fs.mkdirSync(path.dirname(headerFile), { recursive: true });
  fs.writeFileSync(headerFile, [
    { type: "session", version: 3, id: "disk-header", cwd: "shared-cwd" }, bindEntry("alpha"),
  ].map((entry) => `${JSON.stringify(entry)}\n`).join(""));
  const headerMismatch = new NativeShapedSessionManager({ file: headerFile, persist: true, entries: [
    { type: "session", version: 3, id: "loaded-header", cwd: "shared-cwd" }, bindEntry("alpha"),
  ] });
  assert.throws(() => inspectSessionBinding({ registryPath: REGISTRY, sessionManager: headerMismatch }), { code: "ACCOUNT_SESSION_UNDECIDABLE" });

  const changedFile = path.join(ROOT, "sessions", "raw-binding-changed.jsonl");
  fs.writeFileSync(changedFile, [
    { type: "session", version: 3, id: "loaded-same", cwd: "shared-cwd" }, bindEntry("alpha"),
  ].map((entry) => `${JSON.stringify(entry)}\n`).join(""));
  const loaded = new NativeShapedSessionManager({ file: changedFile, persist: true, entries: [
    { type: "session", version: 3, id: "loaded-same", cwd: "shared-cwd" }, bindEntry("alpha"),
  ] });
  fs.writeFileSync(changedFile, [
    { type: "session", version: 3, id: "loaded-same", cwd: "shared-cwd" }, bindEntry("bravo"),
  ].map((entry) => `${JSON.stringify(entry)}\n`).join(""));
  assert.throws(() => inspectSessionBinding({ registryPath: REGISTRY, sessionManager: loaded }), { code: "ACCOUNT_SESSION_UNDECIDABLE" });
});

test("persisted inspection streams multi-chunk UTF-8 JSONL without reading the whole session", async () => {
  const file = path.join(ROOT, "sessions", "streamed-session.jsonl");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const header = { type: "session", version: 3, id: "streamed-session", cwd: "shared-cwd" };
  const binding = bindEntry("alpha");
  const preface = `${JSON.stringify(header)}\r\n\r\n`;
  const prefix = JSON.stringify({ type: "message", id: "large", content: "" });
  const start = Buffer.byteLength(preface + prefix.slice(0, prefix.indexOf('""') + 1));
  const padding = (64 * 1024 - 1 - start + 64 * 1024) % (64 * 1024);
  const large = { type: "message", id: "large", content: `${"x".repeat(padding)}😀${"y".repeat(150_000)}` };
  const largeLine = JSON.stringify(large);
  const bytes = Buffer.from(`${preface}${largeLine}\r\n${JSON.stringify(binding)}`);
  const emojiOffset = bytes.indexOf(Buffer.from("😀"));
  assert.equal(emojiOffset % (64 * 1024), 64 * 1024 - 1, "emoji must cross a read-chunk boundary");
  fs.writeFileSync(file, bytes);
  const manager = new NativeShapedSessionManager({ file, persist: true, entries: [binding], sessionId: header.id });
  const before = fs.readFileSync(file);
  const readFileSync = fs.readFileSync;
  const readSync = fs.readSync;
  let readCalls = 0;
  fs.readFileSync = function (target, ...args) {
    assert.notEqual(path.resolve(String(target)), path.resolve(file), "inspector must not read whole session file");
    return readFileSync.call(this, target, ...args);
  };
  fs.readSync = function (...args) { readCalls += 1; return readSync.apply(this, args); };
  try {
    assert.equal(inspectSessionBinding({ registryPath: REGISTRY, sessionManager: manager }).id, "alpha");
    assert.equal((await selectSessionAccount({ registryPath: REGISTRY, sessionManager: manager })).id, "alpha");
  } finally {
    fs.readFileSync = readFileSync;
    fs.readSync = readSync;
  }
  assert.ok(readCalls > 2, `expected multiple chunk reads, got ${readCalls}`);
  assert.deepEqual(fs.readFileSync(file), before, "inspection/selection must not rewrite session bytes");
});

test("streamed inspection rejects late malformed records before header/binding decisions", () => {
  const file = path.join(ROOT, "sessions", "streamed-invalid.jsonl");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const header = { type: "session", version: 3, id: "streamed-invalid", cwd: "shared-cwd" };
  const binding = bindEntry("alpha");
  const makeManager = (records) => {
    fs.writeFileSync(file, `${[header, ...records].map((entry) => JSON.stringify(entry)).join("\n")}\n`);
    return new NativeShapedSessionManager({ file, persist: true, entries: [binding], sessionId: header.id });
  };
  for (const suffix of ["not-json", "42", "[]", "null"]) {
    const manager = makeManager([binding, { type: "message", content: "late" }]);
    fs.appendFileSync(file, `${suffix}\n`);
    assert.throws(() => inspectSessionBinding({ registryPath: REGISTRY, sessionManager: manager }), { code: "ACCOUNT_SESSION_UNDECIDABLE" }, suffix);
  }
  const duplicate = makeManager([binding, header]);
  assert.throws(() => inspectSessionBinding({ registryPath: REGISTRY, sessionManager: duplicate }), { code: "ACCOUNT_SESSION_UNDECIDABLE" });

  const malformedLateBinding = { ...binding, type: "custom_message" };
  const malformed = makeManager([{ type: "message", content: "late" }, malformedLateBinding]);
  assert.throws(() => inspectSessionBinding({ registryPath: REGISTRY, sessionManager: malformed }), { code: "ACCOUNT_BINDING_MALFORMED" });
  const conflicting = makeManager([{ type: "message", content: "late" }, binding, bindEntry("bravo", { id: "off-branch" })]);
  assert.throws(() => inspectSessionBinding({ registryPath: REGISTRY, sessionManager: conflicting }), { code: "ACCOUNT_BINDING_CONFLICT" });
});

test("cancellation fails closed and malformed metadata never becomes a legacy picker", async () => {
  await assert.rejects(selectSessionAccount({ registryPath: REGISTRY, sessionManager: new NativeShapedSessionManager(), pickAccount: () => null }), { code: "ACCOUNT_SELECTION_CANCELLED" });
  await assert.rejects(selectSessionAccount({ registryPath: REGISTRY, sessionManager: new NativeShapedSessionManager(), pickAccount: () => "missing" }), { code: "ACCOUNT_BINDING_UNKNOWN" });
});

test("credentials-only registration creates no session/workspace/home/history tree and is idempotent", () => {
  const created = createAccount({ registryPath: REGISTRY, id: "delta", label: "Delta" });
  assert.equal(created.id, "delta");
  const base = path.join(path.dirname(REGISTRY), "profiles", "delta");
  assert.equal(created.agentDir, path.join(base, ".pi", "agent"));
  assert.deepEqual(created.sessionRoots, [path.join(base, ".pi", "agent", "sessions")]);
  assert.equal(fs.statSync(created.agentDir).isDirectory(), true);
  for (const unavailable of [created.sessionRoots[0], path.join(base, "workspace"), path.join(base, ".pi", "memory"), path.join(base, ".pi", "settings.json"), path.join(base, "home")]) assert.equal(fs.existsSync(unavailable), false, unavailable);
  assert.equal(createAccount({ registryPath: REGISTRY, id: "delta", label: "Delta" }).id, "delta");
  assert.equal(listUsers({ registryPath: REGISTRY }).some((user) => user.id === "kevin"), false);
  assert.throws(() => createAccount({ registryPath: REGISTRY, id: "Kevin", label: "Kevin" }), { code: "USER_ID_INVALID" });
});

test("registry lock and hard-link alias protections remain effective in the owned fixture", () => {
  const lock = `${REGISTRY}.lock`;
  fs.mkdirSync(lock);
  assert.throws(() => registerUser({ registryPath: REGISTRY, id: "echo", label: "Echo", agentDir: path.join(ROOT, "profiles", "echo", "agent"), lockTimeoutMs: 0 }), { code: "REGISTRY_LOCK_TIMEOUT" });
  assert.equal(fs.statSync(lock).isDirectory(), true, "foreign lock fixture is preserved");
  const alias = path.join(ROOT, "registry", "owned-hardlink.json");
  fs.linkSync(REGISTRY, alias);
  assert.throws(() => listUsers({ registryPath: REGISTRY }), { code: "REGISTRY_ALIAS" });
  assert.equal(fs.statSync(alias).isFile(), true, "owned hard-link evidence is preserved");
});

after(() => {
  assert.deepEqual(JSON.parse(fs.readFileSync(sentinel, "utf8")), { cwd: "shared-cwd", settings: "shared-settings", history: "shared-history", memory: "shared-memory" });
  const sourceAfter = protectedFiles.map(([name, file, expected], index) => {
    if (sourceBefore[index].absent) {
      assert.equal(fs.existsSync(file), false, `${name} appeared during synthetic test`);
      return sourceBefore[index];
    }
    const actual = hash(file);
    assert.equal(actual, expected, `${name} changed during synthetic test`);
    return { ...sourceBefore[index], after: actual, unchanged: actual === sourceBefore[index].before };
  });
  fs.writeFileSync(RESOURCE_MANIFEST, JSON.stringify({ root: ROOT, registryPath: REGISTRY, allStateAndEvidenceRunOwned: true, resources: [REGISTRY, `${REGISTRY}.lock`, path.dirname(sentinel), path.dirname(REGISTRY), path.join(ROOT, "sessions"), path.join(ROOT, "profiles"), RESOURCE_MANIFEST], sharedStateSentinel: { path: sentinel, unchanged: true }, protectedHashes: sourceAfter }, null, 2));
  console.log(`SYNTHETIC_RESOURCE_MANIFEST=${RESOURCE_MANIFEST}`);
});
