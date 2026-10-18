import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as lib from "../public/lib.js";

describe("text utils", () => {
  test("reconcileEntries keeps prompts submitted after a stale entries snapshot", () => {
    const pending = { role: "user", content: [{ type: "text", text: "run this" }], _optimistic: true };
    const stale = [];
    assert.deepEqual(lib.reconcileEntries(stale, [pending]), [pending]);
    assert.deepEqual(lib.reconcileEntries(stale, [null, { role: "assistant" }]), stale);
    const committed = [{ role: "user", content: "run this" }];
    assert.deepEqual(lib.reconcileEntries(committed, [pending]), committed);
  });
  test("escapeHtml", () => {
    assert.equal(lib.escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    assert.equal(lib.escapeHtml(null), "");
  });

  test("session gate: prompts wait for the in-flight switch, never reject, clear themselves", async () => {
    const holder = {};
    await lib.waitSessionGate(holder);
    let finish;
    const gate = lib.setSessionGate(holder, new Promise((resolve) => { finish = resolve; }));
    assert.equal(holder.gate, gate);
    let waited = false;
    const waiter = lib.waitSessionGate(holder).then(() => { waited = true; });
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(waited, false);
    finish({ success: true });
    await waiter;
    assert.equal(waited, true);
    assert.equal(holder.gate, null);
    // A rejected switch still opens the gate.
    await lib.setSessionGate(holder, Promise.reject(new Error("x")));
    assert.equal(holder.gate, null);
    // A newer switch replaces an older one; the older settling does not clear it.
    let finishOld;
    let finishNew;
    lib.setSessionGate(holder, new Promise((resolve) => { finishOld = resolve; }));
    const newer = lib.setSessionGate(holder, new Promise((resolve) => { finishNew = resolve; }));
    finishOld();
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(holder.gate, newer);
    const both = lib.waitSessionGate(holder);
    finishNew();
    await both;
    assert.equal(holder.gate, null);
  });

  test("shouldShowToast", () => {
    const seen = new Map();
    assert.equal(lib.shouldShowToast(seen, "a", 1000), true);
    assert.equal(lib.shouldShowToast(seen, "a", 30_000), false);
    assert.equal(lib.shouldShowToast(seen, "b", 30_000), true);
    assert.equal(lib.shouldShowToast(seen, "a", 61_000), true);
    assert.equal(lib.shouldShowToast(seen, "a", 61_050, 100), false);
  });

  test("stripAnsi", () => {
    assert.equal(lib.stripAnsi("\x1b[38;2;224;108;120mMCP\x1b[39m ok"), "MCP ok");
    assert.equal(lib.stripAnsi("\x1b]8;;https://x\x07link\x1b]8;;\x1b\\"), "link");
    assert.equal(lib.stripAnsi("a\x1bMb"), "ab");
    assert.equal(lib.stripAnsi(undefined), "");
  });
  test("countLines", () => {
    assert.equal(lib.countLines(undefined), 0);
    assert.equal(lib.countLines(""), 0);
    assert.equal(lib.countLines("a\n"), 1);
    assert.equal(lib.countLines("a\nb"), 2);
  });
  test("plural / truncate / basename / isLongText", () => {
    assert.equal(lib.plural(1, "arquivo", "arquivos"), "1 arquivo");
    assert.equal(lib.plural(3, "arquivo", "arquivos"), "3 arquivos");
    assert.equal(lib.truncate("abc", 5), "abc");
    assert.equal(lib.truncate("abcdef", 4), "abc…");
    assert.equal(lib.truncate(null, 4), "");
    assert.equal(lib.basename("C:\\a\\b\\file.js"), "file.js");
    assert.equal(lib.basename("src/app.js/"), "app.js");
    assert.equal(lib.basename(""), "");
    assert.equal(lib.basename(undefined), "");
    assert.equal(lib.isLongText("x".repeat(701)), true);
    assert.equal(lib.isLongText("a\n".repeat(11)), true);
    assert.equal(lib.isLongText("curto"), false);
    assert.equal(lib.isLongText(null), false);
  });
});

describe("formatting", () => {
  test("formatElapsed", () => {
    assert.equal(lib.formatElapsed(0), "0 s");
    assert.equal(lib.formatElapsed("nope"), "0 s");
    assert.equal(lib.formatElapsed(-5000), "0 s");
    assert.equal(lib.formatElapsed(45_900), "45 s");
    assert.equal(lib.formatElapsed(76_000), "1 min 16 s");
    assert.equal(lib.formatElapsed(3_720_000), "1 h 2 min");
  });
  test("formatTokens", () => {
    assert.equal(lib.formatTokens("x"), "—");
    assert.equal(lib.formatTokens(999), "999");
    assert.equal(lib.formatTokens(1000), "1k");
    assert.equal(lib.formatTokens(1234), "1.2k");
    assert.equal(lib.formatTokens(60_000), "60k");
    assert.equal(lib.formatTokens(1_500_000), "1.5M");
    assert.equal(lib.formatTokens(2_000_000), "2M");
  });
  test("relativeTime", () => {
    const now = Date.parse("2025-06-10T12:00:00Z");
    assert.equal(lib.relativeTime("bad", now), "");
    assert.equal(lib.relativeTime(now + 5000, now), "agora");
    assert.equal(lib.relativeTime(now - 5 * 60_000, now), "5 min");
    assert.equal(lib.relativeTime(now - 3 * 3_600_000, now), "3 h");
    assert.equal(lib.relativeTime(now - 2 * 86_400_000, now), "2 d");
    assert.match(lib.relativeTime("2025-05-01T12:00:00Z", now), /\d/);
    assert.equal(typeof lib.relativeTime(new Date().toISOString()), "string");
  });
  test("greeting", () => {
    assert.equal(lib.greeting(3, "Miguel"), "Boa noite, Miguel");
    assert.equal(lib.greeting(9, "Miguel"), "Bom dia, Miguel");
    assert.equal(lib.greeting(14, "Miguel"), "Boa tarde, Miguel");
    assert.equal(lib.greeting(21, ""), "Boa noite");
  });
  test("thinking + model labels", () => {
    assert.equal(lib.thinkingLabel("high"), "Alto");
    assert.equal(lib.thinkingLabel("custom"), "custom");
    assert.equal(lib.thinkingLabel(undefined), "");
    assert.equal(lib.modelLabel(null), "Sem modelo");
    assert.equal(lib.modelLabel({ name: "Claude", id: "c" }), "Claude");
    assert.equal(lib.modelLabel({ id: "c" }), "c");
    assert.equal(lib.modelLabel({}), "Modelo");
  });
  test("normalizeModels accepts the rpc.md shape and the providers shape", () => {
    assert.deepEqual(lib.normalizeModels({ models: [null, { id: "a", provider: "p" }, { id: "b" }] }), [{ id: "a", provider: "p" }, { id: "b", provider: "" }]);
    assert.deepEqual(
      lib.normalizeModels({ providers: [{ name: "fake", models: [{ id: "m" }, { id: "n", provider: "own" }] }, { name: "empty" }, null, { models: [{ id: "z" }] }] }),
      [{ id: "m", provider: "fake" }, { id: "n", provider: "own" }, { id: "z", provider: "" }],
    );
    assert.deepEqual(lib.normalizeModels(undefined), []);
  });
  test("contextUsage degrades gracefully", () => {
    assert.equal(lib.contextUsage(null), null);
    assert.equal(lib.contextUsage({}), null);
    assert.deepEqual(lib.contextUsage({ contextUsage: { tokens: 60000, contextWindow: 200000, percent: 30 } }), { percent: 30, tokens: 60000, contextWindow: 200000 });
    assert.deepEqual(lib.contextUsage({ contextUsage: { tokens: 50, contextWindow: 200, percent: null } }), { percent: 25, tokens: 50, contextWindow: 200 });
    assert.equal(lib.contextUsage({ contextUsage: { tokens: null, contextWindow: 200, percent: null } }), null);
    assert.equal(lib.contextUsage({ contextUsage: { tokens: 10, contextWindow: 0, percent: null } }), null);
    assert.deepEqual(lib.contextUsage({ contextUsage: { tokens: null, percent: 140 } }), { percent: 100, tokens: null, contextWindow: null });
    assert.equal(lib.contextUsage({ contextUsage: { percent: -3 } }).percent, 0);
  });
});

describe("markdown", () => {
  test("inline: code, links, autolinks, emphasis, escaping", () => {
    assert.equal(lib.renderInline("use `a<b>` now"), "use <code>a&lt;b&gt;</code> now");
    assert.equal(lib.renderInline("``x`y``"), "<code>x`y</code>");
    assert.equal(
      lib.renderInline('[docs](https://x.dev/a?b=1&c=2 "t")'),
      '<a href="https://x.dev/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">docs</a>',
    );
    assert.equal(lib.renderInline("[x](javascript:alert(1))"), "[x](javascript:alert(1))");
    assert.equal(lib.renderInline("[x](javascript:void)"), "x");
    assert.equal(lib.renderInline("[mail](mailto:a@b.c)"), '<a href="mailto:a@b.c" target="_blank" rel="noopener noreferrer">mail</a>');
    assert.equal(lib.renderInline("veja https://a.dev/x."), 'veja <a href="https://a.dev/x" target="_blank" rel="noopener noreferrer">https://a.dev/x</a>.');
    assert.equal(lib.renderInline("**b** __c__ ~~d~~ *e* _f_"), "<strong>b</strong> <strong>c</strong> <del>d</del> <em>e</em> <em>f</em>");
    assert.equal(lib.renderInline("snake_case_name and 2*3*4"), "snake_case_name and 2*3*4");
    assert.equal(lib.renderInline("<script>\u0000"), "&lt;script&gt;");
    assert.equal(lib.renderInline(undefined), "");
  });

  test("blocks: headings, rules, quotes, paragraphs", () => {
    assert.equal(lib.renderMarkdown(""), "");
    assert.equal(lib.renderMarkdown(null), "");
    assert.equal(lib.renderMarkdown("# Título ##\n\n---\n\n> citação\n> *dois*"), "<h1>Título</h1><hr><blockquote><p>citação<br><em>dois</em></p></blockquote>");
    assert.equal(lib.renderMarkdown("linha 1\r\nlinha 2\n### Sub"), "<p>linha 1<br>linha 2</p><h3>Sub</h3>");
  });

  test("code fences: language, plain, unclosed, tildes", () => {
    const js = lib.renderMarkdown("```js\nconst a = '<b>';\n```\ndepois");
    assert.match(js, /<span class="code-lang">js<\/span>/);
    assert.match(js, /<code class="language-js">const a = &#39;&lt;b&gt;&#39;;<\/code>/);
    assert.match(js, /data-copy/);
    assert.match(js, /<p>depois<\/p>$/);
    assert.match(lib.renderMarkdown("```\nplain"), /<span class="code-lang">texto<\/span>.*<pre><code>plain<\/code>/);
    assert.match(lib.renderMarkdown("~~~py\nx\n~~~"), /language-py">x</);
  });

  test("tables with alignment and missing cells", () => {
    const html = lib.renderMarkdown("| a | b | c | d |\n|:-:|--:|:--|---|\n| 1 | **2** |\n\nfim");
    assert.match(html, /<th style="text-align:center">a<\/th><th style="text-align:right">b<\/th><th style="text-align:left">c<\/th><th>d<\/th>/);
    assert.match(html, /<td style="text-align:center">1<\/td><td style="text-align:right"><strong>2<\/strong><\/td><td style="text-align:left"><\/td><td><\/td>/);
    assert.match(html, /<p>fim<\/p>$/);
    assert.equal(lib.renderMarkdown("a | b"), "<p>a | b</p>");
    assert.equal(lib.renderMarkdown("texto\nx | y"), "<p>texto<br>x | y</p>");
  });

  test("lists: nested, ordered start, tasks, continuation, type switch", () => {
    assert.equal(
      lib.renderMarkdown("- um\n  - dois\n  - três\n- quatro\n  continua"),
      "<ul><li>um<ul><li>dois</li><li>três</li></ul></li><li>quatro<br>continua</li></ul>",
    );
    assert.equal(lib.renderMarkdown("3. c\n4. d"), '<ol start="3"><li>c</li><li>d</li></ol>');
    assert.equal(lib.renderMarkdown("1) a\n- b"), "<ol><li>a</li></ol><ul><li>b</li></ul>");
    assert.equal(
      lib.renderMarkdown("- [ ] fazer\n- [x] feito"),
      '<ul><li><span class="task " aria-hidden="true"></span>fazer</li><li><span class="task done" aria-hidden="true"></span>feito</li></ul>',
    );
    assert.equal(lib.renderMarkdown("- a\ntexto"), "<ul><li>a</li></ul><p>texto</p>");
    assert.equal(lib.renderMarkdown("parágrafo\n- item"), "<p>parágrafo</p><ul><li>item</li></ul>");
  });
});

describe("tools", () => {
  const bash = { id: "b1", name: "bash", args: { command: "npm test\n--watch" }, status: "done" };
  const edit = { id: "e1", name: "edit", args: { path: "src/a.js", edits: [{ oldText: "x", newText: "y\nz" }] }, status: "done" };
  const write = { id: "w1", name: "write", args: { path: "src/new.js", content: "a\nb\nc\n" }, status: "done" };

  test("toolKind / toolPath", () => {
    assert.deepEqual(["bash", "Edit", "write", "read", "grep", "find", "ls", "mcp", undefined].map(lib.toolKind), ["command", "edit", "write", "read", "search", "search", "search", "other", "other"]);
    assert.equal(lib.toolPath({ path: "a" }), "a");
    assert.equal(lib.toolPath({ file_path: "b" }), "b");
    assert.equal(lib.toolPath({ filePath: "c" }), "c");
    assert.equal(lib.toolPath({ path: 3 }), "");
    assert.equal(lib.toolPath(undefined), "");
  });

  test("shortArgs", () => {
    assert.equal(lib.shortArgs("bash", bash.args), "npm test");
    assert.equal(lib.shortArgs("bash", {}), "");
    assert.equal(lib.shortArgs("grep", { pattern: "TODO", path: "src" }), "TODO · src");
    assert.equal(lib.shortArgs("grep", { pattern: "TODO" }), "TODO");
    assert.equal(lib.shortArgs("read", { path: "a.md" }), "a.md");
    assert.equal(lib.shortArgs("custom", { n: 1, query: "linha 1\nlinha 2" }), "linha 1");
    assert.equal(lib.shortArgs("custom", { n: 1 }), "");
    assert.equal(lib.shortArgs("custom", null), "");
    assert.equal(lib.shortArgs("custom"), "");
  });

  test("toolResultText", () => {
    assert.equal(lib.toolResultText(null), "");
    assert.equal(lib.toolResultText("raw"), "raw");
    assert.equal(lib.toolResultText({ content: [{ type: "text", text: "a" }, { type: "image" }, { type: "text" }, null, { type: "other" }] }), "a\n[imagem]");
    assert.equal(lib.toolResultText({ details: {} }), "");
  });

  test("diff counting and stats", () => {
    assert.deepEqual(lib.countDiffLines("--- a\n+++ b\n+1 x\n-2 y\n 3 z\n+4 w"), { added: 2, removed: 1 });
    assert.deepEqual(lib.countDiffLines(null), { added: 0, removed: 0 });
    assert.deepEqual(lib.diffStats({ ...edit, result: { details: { diff: "-1 a\n+1 b\n+2 c" } } }), { added: 2, removed: 1 });
    assert.deepEqual(lib.diffStats({ ...write, result: { details: { diff: "+1 a" } } }), { added: 1, removed: 0 });
    assert.deepEqual(lib.diffStats(write), { added: 3, removed: 0 });
    assert.deepEqual(lib.diffStats(edit), { added: 2, removed: 1 });
    assert.deepEqual(lib.diffStats({ name: "edit", args: { oldText: "a\nb", newText: "c" } }), { added: 1, removed: 2 });
    assert.deepEqual(lib.diffStats({ name: "edit", args: { newText: "c" } }), { added: 1, removed: 0 });
    assert.deepEqual(lib.diffStats({ name: "edit", args: { edits: [null, { newText: "q" }] } }), { added: 1, removed: 0 });
    assert.deepEqual(lib.diffStats({ name: "edit" }), { added: 0, removed: 0 });
    assert.deepEqual(lib.diffStats(bash), { added: 0, removed: 0 });
    assert.deepEqual(lib.diffStats(undefined), { added: 0, removed: 0 });
  });

  test("diffLines", () => {
    assert.deepEqual(lib.diffLines({ ...edit, result: { details: { diff: "-1 a\n+1 b\n 2 c" } } }).map((line) => line.type), ["del", "add", "ctx"]);
    assert.deepEqual(lib.diffLines(write), [{ type: "add", text: "+ a" }, { type: "add", text: "+ b" }, { type: "add", text: "+ c" }]);
    assert.deepEqual(lib.diffLines({ name: "write" }), [{ type: "add", text: "+ " }]);
    assert.deepEqual(
      lib.diffLines({ name: "edit", args: { edits: [{ oldText: "a", newText: "b" }, { newText: "c" }] } }).map((line) => `${line.type}:${line.text}`),
      ["del:- a", "add:+ b", "meta:…", "del:- ", "add:+ c"],
    );
    assert.deepEqual(lib.diffLines({ name: "edit", args: { edits: [{ oldText: "a" }] } }).map((line) => line.text), ["- a", "+ "]);
    assert.deepEqual(lib.diffLines({ ...bash, result: { content: [{ type: "text", text: "ok\nfim" }] } }), [{ type: "ctx", text: "ok" }, { type: "ctx", text: "fim" }]);
    assert.deepEqual(lib.diffLines(undefined), [{ type: "ctx", text: "" }]);
  });

  test("isFileChange / summarizeTools / runningTool", () => {
    assert.equal(lib.isFileChange(edit), true);
    assert.equal(lib.isFileChange({ name: "write", args: {} }), false);
    assert.equal(lib.isFileChange(bash), false);
    assert.equal(lib.isFileChange(undefined), false);
    assert.equal(lib.summarizeTools(), "Nenhuma ferramenta");
    assert.equal(lib.summarizeTools([bash]), "Executou 1 comando");
    assert.equal(
      lib.summarizeTools([
        bash, bash, edit, { ...edit, id: "e2" }, { name: "edit", id: "nopath", args: {} }, write,
        { name: "read", args: { path: "x" } }, { name: "grep", args: {} }, { name: "ls", args: {} }, { name: "mcp" }, null,
      ]),
      "Executou 2 comandos · editou 2 arquivos · criou 1 arquivo · leu 1 arquivo · fez 2 buscas · usou 2 ferramentas",
    );
    assert.equal(lib.summarizeTools([write, { name: "write", id: "w9", args: {} }]), "Criou 2 arquivos");
    assert.equal(lib.runningTool([bash, { ...edit, status: "running" }]).id, "e1");
    assert.equal(lib.runningTool([bash]), null);
    assert.equal(lib.runningTool(), null);
  });

  test("collectOutputs aggregates per file", () => {
    const outputs = lib.collectOutputs([
      write,
      { ...edit, id: "e2", args: { path: "src/new.js", edits: [{ oldText: "a", newText: "b" }] } },
      edit,
      { ...edit, id: "e3" },
      { ...edit, id: "bad", isError: true },
      bash,
    ]);
    assert.deepEqual(outputs, [
      { path: "src/new.js", name: "new.js", kind: "write", added: 4, removed: 1, toolIds: ["w1", "e2"] },
      { path: "src/a.js", name: "a.js", kind: "edit", added: 4, removed: 2, toolIds: ["e1", "e3"] },
    ]);
    assert.deepEqual(lib.collectOutputs(), []);
  });
});

describe("messages", () => {
  test("activeBranch follows the leaf to the root", () => {
    const entries = [
      { id: "a", parentId: null },
      { id: "b", parentId: "a" },
      { id: "x", parentId: "a" },
      null,
      { id: "c", parentId: "b" },
    ];
    assert.deepEqual(lib.activeBranch(entries, "c").map((entry) => entry.id), ["a", "b", "c"]);
    assert.equal(lib.activeBranch(entries).length, 4);
    assert.equal(lib.activeBranch(entries, "zzz").length, 4);
    assert.deepEqual(lib.activeBranch("nope", "a"), []);
    assert.deepEqual(lib.activeBranch(), []);
    const loop = [{ id: "p", parentId: "q" }, { id: "q", parentId: "p" }];
    assert.deepEqual(lib.activeBranch(loop, "p").map((entry) => entry.id), ["q", "p"]);
    assert.deepEqual(lib.activeBranch([{ id: "r", parentId: "missing" }], "r").map((entry) => entry.id), ["r"]);
  });

  test("entriesToMessages maps entry types", () => {
    const messages = lib.entriesToMessages([
      { type: "session" },
      { type: "message", id: "1", message: { role: "user", content: "oi" } },
      { type: "message", id: "1b" },
      { type: "custom_message", id: "2", content: "ctx", display: true, timestamp: "t" },
      { type: "compaction", id: "3", summary: "s", tokensBefore: 10 },
      { type: "branch_summary", id: "4", summary: "b" },
      { type: "model_change", id: "5" },
    ]);
    assert.deepEqual(messages, [
      { role: "user", content: "oi" },
      { role: "custom", content: "ctx", display: true, timestamp: "t" },
      { role: "compactionSummary", summary: "s", tokensBefore: 10 },
      { role: "branchSummary", summary: "b" },
    ]);
  });

  test("messageText / messageImages", () => {
    assert.equal(lib.messageText(null), "");
    assert.equal(lib.messageText({ content: "a" }), "a");
    assert.equal(lib.messageText({ content: [{ type: "text", text: "a" }, { type: "image" }, { type: "text" }, null] }), "a\n");
    assert.equal(lib.messageText({ content: 5 }), "");
    assert.deepEqual(lib.messageImages({ content: "x" }), []);
    assert.deepEqual(lib.messageImages(undefined), []);
    assert.deepEqual(lib.messageImages({ content: [{ type: "image", data: "AA" }, { type: "image", data: "BB", mimeType: "image/jpeg" }, { type: "image" }, null] }), [
      { data: "AA", mimeType: "image/png" },
      { data: "BB", mimeType: "image/jpeg" },
    ]);
  });

  test("upsertMessage dedupes stream echoes", () => {
    const list = [];
    assert.equal(lib.upsertMessage(list, null), list);
    lib.upsertMessage(list, { role: "user", content: "a", _optimistic: true, timestamp: 1 });
    lib.upsertMessage(list, { role: "user", content: "a", timestamp: 5 });
    assert.deepEqual(list, [{ role: "user", content: "a", timestamp: 5 }]);
    lib.upsertMessage(list, { role: "user", content: "a2", timestamp: 5 });
    assert.equal(list.length, 1);
    assert.equal(list[0].content, "a2");
    lib.upsertMessage(list, { role: "toolResult", toolCallId: "t", content: "1" });
    lib.upsertMessage(list, { role: "toolResult", toolCallId: "t", content: "2" });
    assert.equal(list.length, 2);
    assert.equal(list[1].content, "2");
    lib.upsertMessage(list, { role: "assistant", content: [] });
    lib.upsertMessage(list, { role: "user", content: "b", timestamp: 9 });
    assert.equal(list.length, 4);
  });

  test("applyAssistantDelta", () => {
    const message = {};
    lib.applyAssistantDelta(message, { type: "thinking_delta", contentIndex: 0, delta: "pen" });
    lib.applyAssistantDelta(message, { type: "thinking_delta", contentIndex: 0, delta: "so" });
    lib.applyAssistantDelta(message, { type: "text_delta", contentIndex: 0, delta: "Olá" });
    lib.applyAssistantDelta(message, { type: "text_delta", delta: " mundo" });
    lib.applyAssistantDelta(message, { type: "text_delta" });
    lib.applyAssistantDelta(message, { type: "toolcall_end", toolCall: { id: "c1", name: "bash" } });
    lib.applyAssistantDelta(message, { type: "toolcall_end", toolCall: { id: "c1", name: "bash" } });
    lib.applyAssistantDelta(message, { type: "thinking_delta", delta: "mais" });
    lib.applyAssistantDelta(message, { type: "toolcall_end" });
    lib.applyAssistantDelta(message, { type: "done" });
    lib.applyAssistantDelta(message, undefined);
    assert.deepEqual(message.content, [
      { type: "thinking", thinking: "penso" },
      { type: "text", text: "Olá mundo" },
      { type: "toolCall", id: "c1", name: "bash" },
      { type: "thinking", thinking: "mais" },
    ]);
    const sparse = { content: [{ type: "toolCall", id: "z" }] };
    lib.applyAssistantDelta(sparse, { type: "text_delta", contentIndex: 0, delta: "a" });
    lib.applyAssistantDelta(sparse, { type: "text_delta", contentIndex: 0, delta: "b" });
    assert.deepEqual(sparse.content[1], { type: "text", text: "ab" });
  });
});

describe("buildTimeline", () => {
  test("groups consecutive tools, attaches thinking, applies results", () => {
    const messages = [
      null,
      { role: "user", content: "faça", _optimistic: true },
      { role: "assistant", content: [{ type: "thinking", thinking: "plano" }, { type: "thinking", thinking: "  " }, { type: "toolCall", id: "c1", name: "bash", arguments: { command: "ls" } }] },
      { role: "toolResult", toolCallId: "c1", toolName: "bash", content: [{ type: "text", text: "a" }], isError: false },
      { role: "assistant", content: [{ type: "thinking", thinking: "segundo" }, { type: "toolCall", name: "edit" }, null] },
      { role: "toolResult", toolName: "read", content: [], isError: true },
      { role: "bashExecution", command: "pwd", output: "/x", exitCode: 0 },
      { role: "assistant", content: [{ type: "text", text: "  " }, { type: "thinking", thinking: "x" }, { type: "thinking", thinking: "y" }, { type: "text", text: "Pronto" }] },
      { role: "assistant", content: "texto simples" },
      { role: "assistant", content: undefined },
      { role: "assistant", content: [{ type: "thinking", thinking: "só pensando" }] },
      { role: "assistant", content: [], stopReason: "error", errorMessage: "falhou" },
      { role: "assistant", content: [], stopReason: "error" },
      { role: "assistant", content: [], stopReason: "aborted" },
      { role: "bashExecution", command: "false", exitCode: 1 },
      { role: "bashExecution", command: "sleep", cancelled: true },
      { role: "custom", content: "oculto", display: false },
      { role: "custom", content: "nota" },
      { role: "compactionSummary", summary: "resumo" },
      { role: "branchSummary" },
      { role: "mystery" },
    ];
    const items = lib.buildTimeline(messages);
    assert.deepEqual(items.map((item) => item.kind), ["user", "tools", "assistant", "assistant", "thinking", "error", "notice", "tools", "note", "divider", "divider"]);
    const [user, group, done, simple, thinking, , , failures, , compaction, branch] = items;
    assert.equal(user.optimistic, true);
    assert.equal(group.key, "t:2:c1");
    assert.equal(group.thinking, "plano\n\nsegundo");
    assert.deepEqual(group.tools.map((tool) => [tool.id, tool.name, tool.status]), [["c1", "bash", "done"], ["4.1", "edit", "pending"], ["r5", "read", "error"], ["b:6", "bash", "done"]]);
    assert.equal(done.text, "Pronto");
    assert.equal(done.thinking, "x\n\ny");
    assert.equal(simple.text, "texto simples");
    assert.equal(thinking.text, "só pensando");
    assert.deepEqual(failures.tools.map((tool) => tool.status), ["error", "error"]);
    assert.equal(compaction.text, "Contexto compactado");
    assert.equal(compaction.detail, "resumo");
    assert.equal(branch.text, "Resumo do ramo");
    assert.equal(branch.detail, "");
    assert.deepEqual(lib.buildTimeline(), []);
  });

  test("merges live tool runtime into pending calls and appends orphans", () => {
    const messages = [{ role: "assistant", content: [{ type: "toolCall", id: "c1", name: "bash", arguments: {} }, { type: "toolCall", id: "c2", name: "read", arguments: {} }] }, { role: "toolResult", toolCallId: "c2", content: [] }];
    const runtime = new Map([
      ["c1", { name: "bash", status: "running", partial: { content: [{ type: "text", text: "..." }] } }],
      ["c2", { name: "read", status: "error", result: { content: [] } }],
      ["live", { name: "grep", args: { pattern: "x" }, status: "done", result: { content: [{ type: "text", text: "hit" }] } }],
    ]);
    const [group] = lib.buildTimeline(messages, runtime);
    assert.deepEqual(group.tools.map((tool) => [tool.id, tool.status]), [["c1", "running"], ["c2", "done"], ["live", "done"]]);
    assert.equal(lib.toolResultText(group.tools[0].result), "...");
    assert.equal(lib.toolResultText(group.tools[2].result), "hit");

    const afterText = lib.buildTimeline([{ role: "assistant", content: "oi" }], new Map([["x", { name: "bash", status: "error" }], ["y", { name: "ls", status: "running" }]]));
    assert.deepEqual(afterText.map((item) => item.kind), ["assistant", "tools"]);
    assert.deepEqual(afterText[1].tools.map((tool) => [tool.id, tool.status, tool.isError, tool.result]), [["x", "error", true, null], ["y", "running", false, null]]);
  });

  test("group keys stay unique when tool ids repeat across turns", () => {
    const turn = [{ role: "user", content: "x" }, { role: "assistant", content: [{ type: "toolCall", id: "same", name: "bash" }] }];
    const keys = lib.buildTimeline([...turn, ...turn]).filter((item) => item.kind === "tools").map((item) => item.key);
    assert.equal(new Set(keys).size, 2);
  });

  test("timelineTools + timelineSignature", () => {
    const items = lib.buildTimeline([
      { role: "user", content: [{ type: "text", text: "a" }, { type: "image", data: "AA" }] },
      { role: "assistant", content: [{ type: "toolCall", id: "c", name: "bash" }] },
      { role: "compactionSummary", summary: "s" },
    ]);
    assert.deepEqual(lib.timelineTools(items).map((tool) => tool.id), ["c"]);
    assert.equal(lib.timelineSignature(items[0]), "user|0|1||a|");
    assert.equal(lib.timelineSignature(items[1]), "tools|0|c:pending:0");
    assert.equal(lib.timelineSignature({ kind: "tools", thinking: "abc", tools: [] }), "tools|3|");
    assert.equal(lib.timelineSignature(items[2]), "divider|0|0||Contexto compactado|s");
    assert.equal(lib.timelineSignature({ kind: "x", optimistic: true }), "x|1|0|||");
  });
});

describe("composer + dialogs", () => {
  test("composerAction maps keys to RPC verbs", () => {
    const key = (extra) => ({ key: "Enter", ...extra });
    assert.equal(lib.composerAction(null, false), null);
    assert.equal(lib.composerAction({ key: "a" }, false), null);
    assert.equal(lib.composerAction(key({ isComposing: true }), false), null);
    assert.equal(lib.composerAction(key({ shiftKey: true }), true), "newline");
    assert.equal(lib.composerAction(key({ ctrlKey: true }), true), "follow_up");
    assert.equal(lib.composerAction(key({ metaKey: true }), false), "prompt");
    assert.equal(lib.composerAction(key(), true), "steer");
    assert.equal(lib.composerAction(key(), false), "prompt");
  });

  test("updateProcessExitUi without code or signal", () => {
    const status = { textContent: "", classList: { remove() {} } };
    const elements = { status, prompt: {}, action: {}, restart: {} };
    lib.updateProcessExitUi({ code: null, signal: null }, elements);
    assert.equal(status.textContent, "PI encerrado");
    assert.equal(elements.prompt.disabled, true);
    lib.updateProcessExitUi({ code: 0 }, elements);
    assert.equal(status.textContent, "PI encerrado (código 0)");
    lib.updateProcessExitUi({ code: 7 }, elements);
    assert.equal(status.textContent, "PI encerrado (código 7, erro)");
    lib.updateProcessExitUi({ code: null, signal: "SIGTERM" }, elements);
    assert.equal(status.textContent, "PI encerrado (sinal SIGTERM)");
    assert.equal(elements.restart.textContent, "Reiniciar PI");
  });

  test("createUiResponder sends once", async () => {
    const sent = [];
    const responder = lib.createUiResponder("id", async (id, payload) => sent.push([id, payload]));
    await responder.respond({ value: 1 });
    await responder.respond({ value: 2 });
    assert.deepEqual(sent, [["id", { value: 1 }]]);
    let release;
    const slow = lib.createUiResponder("slow", () => new Promise((resolve) => { release = resolve; }));
    let prevented = false;
    const first = slow.respond({ value: "ok" });
    const second = slow.cancel({ preventDefault: () => { prevented = true; } });
    assert.equal(first, second, "concurrent calls share the in-flight send");
    release();
    await Promise.all([first, second]);
    assert.equal(prevented, true);
  });

  test("samePath ignores slashes, trailing separators and case", () => {
    assert.equal(lib.samePath("C:\\A\\b.jsonl", "c:/a/B.jsonl/"), true);
    assert.equal(lib.samePath("a", "b"), false);
    assert.equal(lib.samePath("", "a"), false);
    assert.equal(lib.samePath("a", null), false);
  });
});
