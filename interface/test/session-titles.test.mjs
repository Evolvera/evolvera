// Tests for parent Agent-call title indexing and pictograph cleanup.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createTitleIndex, stripPictographs } from "../lib-server/session-titles.mjs";

// Finds an Agent result by the eight-character session suffix and uses the matching call description.
test("subagentTitle indexes parent Agent calls by agentId prefix", async () => {
  const parent = [
    JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "Agent", id: "call1", arguments: { description: "Implementação 🚀", subagent_type: "builder" } }] } }),
    JSON.stringify({ type: "message", message: { role: "toolResult", toolCallId: "call1", details: { agentId: "12345678-rest", subagentType: "builder" } } }),
  ];
  const index = createTitleIndex({ readLines: async function* () { yield* parent; }, statFile: async () => ({ mtimeMs: 1, size: 100 }) });
  assert.deepEqual(await index.subagentTitle("child", { parentSession: "parent" }, "builder#12345678"), { title: "Implementação", agentType: "builder" });
});

// Applies the documented title fallback chain while tolerating broken parent JSONL lines.
test("subagentTitle falls back through call name, first child prompt, then agent type", async () => {
  let lines = ["Agent {broken", JSON.stringify({ type: "toolCall", name: "Agent", id: "c", arguments: { name: "Nome de chamada" } }), JSON.stringify({ type: "toolResult", toolCallId: "c", details: { agentId: "abcdef12-extra" } })];
  let index = createTitleIndex({ readLines: async function* (file) { yield* (file === "parent" ? lines : [JSON.stringify({ type: "message", message: { role: "user", content: [{ type: "text", text: "  Prompt infantil importante\nsegunda linha" }] } })]); }, statFile: async () => ({ mtimeMs: 1, size: 1 }) });
  assert.deepEqual(await index.subagentTitle("child", { parentSession: "parent" }, "scout#abcdef12"), { title: "Nome de chamada", agentType: "scout" });
  assert.deepEqual(await index.subagentTitle("child", { parentSession: "parent" }, "scout#87654321"), { title: "Prompt infantil importante", agentType: "scout" });
  assert.deepEqual(await index.subagentTitle("child", { parentSession: "parent" }, "scout"), { title: "Prompt infantil importante", agentType: "scout" });
  lines = [];
  index = createTitleIndex({ readLines: async function* (file) { if (file === "child") yield JSON.stringify({ type: "message", message: { role: "user", content: "Prompt infantil importante\nsegunda linha" } }); }, statFile: async () => ({ mtimeMs: 1, size: 1 }) });
  assert.deepEqual(await index.subagentTitle("child", { parentSession: "parent" }, "scout#abcdef12"), { title: "Prompt infantil importante", agentType: "scout" });
  index = createTitleIndex({ readLines: async function* () {}, statFile: async () => ({ mtimeMs: 1, size: 1 }) });
  assert.deepEqual(await index.subagentTitle("child", {}, "scout#abcdef12"), { title: "scout", agentType: "scout" });
});

// Uses the parent mtime+size cache and refreshes it when either metadata value changes.
test("subagentTitle caches by parent mtime and size and invalidates on change", async () => {
  let mtimeMs = 1;
  let size = 10;
  let reads = 0;
  const index = createTitleIndex({ readLines: async function* (file) { if (file === "parent") { reads++; yield "{}"; } }, statFile: async () => ({ mtimeMs, size }) });
  await index.subagentTitle("child", { parentSession: "parent" }, "worker#12345678");
  await index.subagentTitle("child", { parentSession: "parent" }, "worker#12345678");
  assert.equal(reads, 1);
  size++;
  await index.subagentTitle("child", { parentSession: "parent" }, "worker#12345678");
  mtimeMs++;
  await index.subagentTitle("child", { parentSession: "parent" }, "worker#12345678");
  assert.equal(reads, 3);
});

// Stops parent scanning at eight megabytes even if one injected line models a giant JSONL record.
test("subagentTitle caps scanned parent input at 8 MB", async () => {
  let read = 0;
  const index = createTitleIndex({ readLines: async function* (file) { if (file === "parent") { read++; yield "x".repeat(8 * 1024 * 1024 + 10); yield JSON.stringify({ type: "toolCall", name: "Agent", id: "c", arguments: { description: "must not be read" } }); } }, statFile: async () => ({ mtimeMs: 1, size: 1024 * 1024 * 1024 }) });
  assert.deepEqual(await index.subagentTitle("child", { parentSession: "parent" }, "worker#12345678"), { title: "worker", agentType: "worker" });
  assert.equal(read, 1);
});

// Removes Unicode pictographs but retains readable words, punctuation, accents, and separators.
test("stripPictographs removes emoji and pictograph variation sequences", () => {
  assert.equal(stripPictographs(" 🧪 Test 🚀 – ação ♥️ ok "), "Test – ação ok");
  assert.equal(stripPictographs("plain text"), "plain text");
  assert.equal(stripPictographs(null), "");
});

// Handles absent files, malformed/non-string rows, and child prompt shapes without throwing.
test("subagentTitle handles missing parent and child files and malformed JSONL", async () => {
  const index = createTitleIndex({
    readLines: async function* (file) { if (file === "parent") { yield null; yield "Agent {bad"; } else if (file === "child") { yield "broken Agent JSON"; yield JSON.stringify({ type: "message", message: { type: "user", content: {} } }); yield JSON.stringify({ role: "user", content: [{ type: "text", text: "  prompt direto\nlinha dois" }] }); } else throw new Error("gone"); },
    statFile: async (file) => { if (file === "gone") throw new Error("gone"); return { mtimeMs: 1, size: 2 }; },
  });
  assert.deepEqual(await index.subagentTitle("child", { parentSession: "parent" }, "general"), { title: "prompt direto", agentType: "general" });
  assert.deepEqual(await index.subagentTitle("child", null, ""), { title: "prompt direto", agentType: "" });
  assert.deepEqual(await index.subagentTitle("gone", { parentSession: "gone" }, "worker"), { title: "worker", agentType: "worker" });
  const arrayPrompt = createTitleIndex({ readLines: async function* () { yield JSON.stringify({ role: "user", content: [{ type: "text", text: "primeiro prompt em partes" }, { type: "image", data: "x" }] }); }, statFile: async () => ({ mtimeMs: 1, size: 1 }) });
  assert.deepEqual(await arrayPrompt.subagentTitle("child", null, "worker"), { title: "primeiro prompt em partes", agentType: "worker" });
  const bounded = createTitleIndex({ readLines: async function* (file) { if (file === "parent") throw new Error("parent vanished"); for (let i = 0; i < 101; i++) yield "{}"; }, statFile: async () => ({}) });
  assert.deepEqual(await bounded.subagentTitle("child", { parentSession: "parent" }, "worker"), { title: "worker", agentType: "worker" });
});

// Coalesces concurrent parent scans and recognizes a root-level Agent tool call result.
test("subagentTitle coalesces inflight parent indexing", async () => {
  let reads = 0;
  const lines = [
    JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "text", text: "Agent" }, null, { type: "toolCall", name: "Other Agent", id: "other" }, { type: "toolCall", name: "Agent", id: "nested", args: {} }] } }),
    JSON.stringify({ type: "toolCall", name: "Agent", id: "nullargs", arguments: null }),
    JSON.stringify({ type: "toolResult", toolCallId: "nullargs", details: [] }),
    JSON.stringify({ type: "toolCall", name: "Agent", id: "c", args: { description: "coalesced", subagent_type: "worker" } }),
    JSON.stringify({ type: "toolResult", toolCallId: "c", details: { agentId: "12345678" } }),
  ];
  const index = createTitleIndex({ readLines: async function* (file) { if (file === "parent") { reads++; await new Promise((resolve) => setTimeout(resolve, 5)); yield* lines; } }, statFile: async () => ({ mtimeMs: 1, size: 10 }) });
  const values = await Promise.all(Array.from({ length: 5 }, () => index.subagentTitle("child", { parentSession: "parent" }, "worker#12345678")));
  assert.equal(reads, 1);
  assert.ok(values.every((value) => value.title === "coalesced"));
});
