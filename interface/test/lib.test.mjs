import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import vm from "node:vm";
import * as lib from "../public/lib.js";

describe("composer send safeguards", () => {
  test("rejects oversized encoded RPC payloads and reports captured images without replacing a newer draft", () => {
    const command = { id: "request-1", type: "prompt", message: "", images: [{ type: "image", mimeType: "image/png", data: "abc" }] };
    assert.equal(lib.requestBodyBytes(command), Buffer.byteLength(JSON.stringify(command)));
    assert.equal(lib.requestExceedsLimit(command, Buffer.byteLength(JSON.stringify(command))), false);
    assert.equal(lib.requestExceedsLimit(command, Buffer.byteLength(JSON.stringify(command)) - 1), true);
    const captured = [{ data: "old" }];
    assert.deepEqual(lib.restoreFailedDraft("", [], "", captured), { message: "", attachments: captured });
    const newer = [{ data: "new" }];
    assert.deepEqual(lib.restoreFailedDraft("new draft", newer, "sent", captured), { message: "new draft", attachments: newer });
  });

  test("extension slash commands always use prompt while built-ins and ordinary text keep their mode", () => {
    const commands = [{ name: "deploy", source: "extension" }, { name: "template", source: "prompt" }];
    assert.equal(lib.composerSendType("/deploy staging", "steer", commands), "prompt");
    assert.equal(lib.composerSendType("/deploy staging", "follow_up", commands), "prompt");
    assert.equal(lib.composerSendType("/new", "steer", commands), "steer");
    assert.equal(lib.composerSendType("/template", "steer", commands), "steer");
    assert.equal(lib.composerSendType("hello", "follow_up", commands), "follow_up");
    assert.equal(lib.composerSendType("hello", "prompt", commands), "prompt");
    assert.equal(lib.composerSendType("/unknown", "steer", commands), "steer");
    assert.equal(lib.composerSendType(null, "prompt", commands), "prompt");
    assert.equal(lib.composerSendType("/deploy args", "steer", null), "steer");
  });
});

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

  test("session switches defer conversation reset until acknowledged and clear stale queue on reconnect", async () => {
    const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
    for (const name of ["openSession", "newSession"]) {
      const start = app.indexOf(`function ${name}(`);
      const end = app.indexOf("\n}", start) + 2;
      const body = app.slice(start, end);
      assert.match(body, /withSessionRollback/);
      assert.ok(body.indexOf("await applied") < body.indexOf("resetConversation()"));
    }
    const reset = app.slice(app.indexOf("function resetConversation()"), app.indexOf("\n}", app.indexOf("function resetConversation()")));
    assert.match(reset, /renderQueue\(\)/);
    assert.match(app, /if \(!state\.replaying\) \{\s*state\.queue = \{ steering: \[\], followUp: \[\] \};\s*renderQueue\(\);/);
    assert.match(app, /if \(!state\.replaying \|\| payload\.type === "queue_update"\) handleRpc\(payload\)/);
  });

  test("withSessionRollback restores state on cancelled or failed session changes", async () => {
    const state = { sessionFile: "/old.jsonl" };
    const previous = { ...state };
    let rollbacks = 0;
    const restore = () => { Object.assign(state, previous); rollbacks++; };
    const cancelled = await lib.withSessionRollback(async () => {
      state.sessionFile = "/wrong.jsonl";
      return { data: { cancelled: true } };
    }, restore);
    assert.equal(cancelled.data.cancelled, true);
    assert.equal(state.sessionFile, "/old.jsonl");
    assert.equal(rollbacks, 1);
    const failed = await lib.withSessionRollback(async () => {
      state.sessionFile = "/failed.jsonl";
      return { success: false, error: "switch failed" };
    }, restore);
    assert.equal(failed.success, false);
    assert.equal(state.sessionFile, "/old.jsonl");
    assert.equal(rollbacks, 2);
    await assert.rejects(lib.withSessionRollback(async () => {
      state.sessionFile = "/failed.jsonl";
      throw new Error("switch failed");
    }, restore), /switch failed/);
    assert.equal(state.sessionFile, "/old.jsonl");
    assert.equal(rollbacks, 3);
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

  test("isAwaitedResponse: only responses to requests still pending on this page", () => {
    const pending = new Map([["ns1", {}]]);
    assert.equal(lib.isAwaitedResponse({ type: "response", id: "ns1" }, pending), true);
    assert.equal(lib.isAwaitedResponse({ type: "response", id: "other" }, pending), false);
    assert.equal(lib.isAwaitedResponse({ type: "response" }, pending), false);
    assert.equal(lib.isAwaitedResponse({ type: "agent_start", id: "ns1" }, pending), false);
    assert.equal(lib.isAwaitedResponse(null, pending), false);
  });

  test("Orca follow advances only after the target project opens", () => {
    assert.equal(lib.followedPath(null, "/tree/a", false), null);
    assert.equal(lib.followedPath(null, "/tree/a", true), "/tree/a");
  });

  test("detaching a project's pending RPCs rejects and clears their timers", async () => {
    let settled = false;
    let cleared = false;
    const oldProject = new Map([["a", { projectId: "a", timer: 1, reject(error) { settled = error.detached; } }], ["b", { projectId: "b", timer: 2, reject() { assert.fail("other project rejected"); } }]]);
    const result = lib.detachProjectRequests(oldProject, "a", () => { cleared = true; });
    assert.equal(result, 1);
    assert.equal(settled, true);
    assert.equal(cleared, true);
    assert.deepEqual([...oldProject.keys()], ["b"]);
  });

  test("runGated claims the gate synchronously and chains after the switch in flight", async () => {
    const holder = {};
    const order = [];
    let finishOpen;
    const open = lib.runGated(holder, () => new Promise((resolve) => { finishOpen = () => { order.push("open"); resolve("opened"); }; }));
    // A second switch ("Nova conversa" clicked while the project opens) claims the gate at once.
    const fresh = lib.runGated(holder, async () => { order.push("new"); return "new"; });
    const gateAfterClaim = holder.gate;
    // A prompt submitted now must run only after both switches.
    const prompt = lib.waitSessionGate(holder).then(() => order.push("prompt"));
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.deepEqual(order, []);
    assert.ok(gateAfterClaim);
    finishOpen();
    assert.equal(await open, "opened");
    assert.equal(await fresh, "new");
    await prompt;
    assert.deepEqual(order, ["open", "new", "prompt"]);
    assert.equal(holder.gate, null);
    // A failing switch rejects its caller but still releases the gate for later work.
    await assert.rejects(lib.runGated(holder, async () => { throw new Error("boom"); }), /boom/);
    await lib.waitSessionGate(holder);
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
      { type: "custom_message", id: "2", customType: "note", content: "ctx", display: true, details: { a: 1 }, timestamp: "t" },
      { type: "compaction", id: "3", summary: "s", tokensBefore: 10 },
      { type: "branch_summary", id: "4", summary: "b" },
      { type: "model_change", id: "5" },
    ]);
    assert.deepEqual(messages, [
      { role: "user", content: "oi" },
      { role: "custom", customType: "note", content: "ctx", display: true, details: { a: 1 }, timestamp: "t" },
      { role: "compactionSummary", summary: "s", tokensBefore: 10 },
      { role: "branchSummary", summary: "b" },
    ]);
  });

  test("customNoteText summarizes subagent notifications, passes other custom messages through", () => {
    const xml = "<task-notification>\n<task-id>a1</task-id>\n</task-notification>";
    assert.equal(lib.customNoteText({ customType: "other", content: "hello" }), "hello");
    assert.equal(lib.customNoteText({ customType: "subagent-notification", content: xml }), xml);
    assert.equal(lib.customNoteText({ customType: "subagent-notification", content: xml, details: { id: "a1" } }), xml);
    assert.equal(lib.customNoteText(null), "");
    assert.equal(lib.customNoteText({ customType: "subagent-notification", content: xml, details: { description: "Auditar", status: "completed" } }), "Subagente: Auditar · concluído");
    assert.equal(lib.customNoteText({ customType: "subagent-notification", details: { description: "Auditar", status: "error", error: "timeout" } }), "Subagente: Auditar · falhou — timeout");
    assert.equal(lib.customNoteText({ customType: "subagent-notification", details: { description: "X", status: "queued" } }), "Subagente: X · queued");
    assert.equal(lib.customNoteText({ customType: "subagent-notification", details: { description: "X" } }), "Subagente: X · atualizado");
    assert.equal(
      lib.customNoteText({ customType: "subagent-notification", details: { description: "A", status: "completed", others: [{ description: "B", status: "aborted" }, null, {}] } }),
      "Subagentes (2): A · concluído; B · interrompido",
    );
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
      { role: "assistant" },
    ];
    const items = lib.buildTimeline(messages);
    assert.deepEqual(items.map((item) => item.kind), ["user", "tools", "bash", "assistant", "assistant", "thinking", "error", "notice", "bash", "bash", "note", "divider", "divider"]);
    const [user, group, shell, done, simple, thinking, , , , failures, , compaction, branch] = items;
    assert.equal(user.optimistic, true);
    assert.equal(group.key, "t:2:c1");
    assert.equal(group.thinking, "plano\n\nsegundo");
    assert.deepEqual(group.tools.map((tool) => [tool.id, tool.name, tool.status]), [["c1", "bash", "done"], ["4.1", "edit", "pending"], ["r5", "read", "error"]]);
    assert.deepEqual([shell.key, shell.text, shell.output, shell.state, shell.exitCode, shell.truncated, shell.detail], ["x:6", "pwd", "/x", "done", 0, false, "done|0|false|2"]);
    assert.equal(done.text, "Pronto");
    assert.equal(done.thinking, "x\n\ny");
    assert.equal(simple.text, "texto simples");
    assert.equal(thinking.text, "só pensando");
    assert.deepEqual([failures.state, failures.exitCode, failures.output], ["cancelled", null, ""]);
    const [, , , , , , , , failed] = items;
    assert.deepEqual([failed.state, failed.exitCode, failed.detail], ["error", 1, "error|1|false|0"]);
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

describe("inspector layout", () => {
  test("tabKeyTarget implements tablist arrow/Home/End navigation", () => {
    assert.equal(lib.tabKeyTarget("ArrowRight", 3, 4), 0);
    assert.equal(lib.tabKeyTarget("ArrowDown", 0, 4), 1);
    assert.equal(lib.tabKeyTarget("ArrowLeft", 0, 4), 3);
    assert.equal(lib.tabKeyTarget("ArrowUp", 2, 4), 1);
    assert.equal(lib.tabKeyTarget("Home", 2, 4), 0);
    assert.equal(lib.tabKeyTarget("End", 0, 4), 3);
    assert.equal(lib.tabKeyTarget("Enter", 0, 4), null);
    assert.equal(lib.tabKeyTarget("ArrowRight", 0, 0), null);
    assert.deepEqual(lib.INSPECTOR_TABS, ["terminal", "subagents", "context", "files", "browser", "worktrees"]);
  });

  test("clampPanelWidth keeps 320px..60% and falls back to 460px", () => {
    assert.equal(lib.clampPanelWidth(null, 1500), 460);
    assert.equal(lib.clampPanelWidth("abc", 1500), 460);
    assert.equal(lib.clampPanelWidth("612.4", 1500), 612);
    assert.equal(lib.clampPanelWidth(100, 1500), 320);
    assert.equal(lib.clampPanelWidth(5000, 1500), 900);
    assert.equal(lib.clampPanelWidth(600, 400), 320);
    assert.equal(lib.clampPanelWidth(undefined, 1000, { min: 200, maxRatio: 0.5, fallback: 900 }), 500);
  });

  test("splitLines / capTail", () => {
    assert.deepEqual(lib.splitLines(null), []);
    assert.deepEqual(lib.splitLines("\n"), []);
    assert.deepEqual(lib.splitLines("a\r\nb\rc\n"), ["a", "b", "c"]);
    assert.deepEqual(lib.capTail([1, 2], 3), { hidden: 0, lines: [1, 2] });
    assert.deepEqual(lib.capTail([1, 2, 3, 4, 5], 2), { hidden: 3, lines: [4, 5] });
    assert.equal(lib.capTail(Array.from({ length: 401 })).hidden, 1);
  });
});

describe("terminal", () => {
  const texts = (lines) => lines.map((line) => line.text);

  test("terminalToolHead prints each tool with its full arguments", () => {
    assert.deepEqual(lib.terminalToolHead("bash", { command: "npm test\necho ok" }), [{ text: "$ npm test", cls: "cmd" }, { text: "  echo ok", cls: "cmd" }]);
    assert.deepEqual(texts(lib.terminalToolHead("bash", {})), ["$ "]);
    assert.deepEqual(texts(lib.terminalToolHead("read", { path: "a.js" })), ["read a.js"]);
    assert.deepEqual(texts(lib.terminalToolHead("read", { path: "a.js", offset: 10, limit: 5 })), ["read a.js:10-14"]);
    assert.deepEqual(texts(lib.terminalToolHead("read", { path: "a.js", limit: 20 })), ["read a.js:1-20"]);
    assert.deepEqual(texts(lib.terminalToolHead("read", { path: "a.js", offset: 7 })), ["read a.js:7"]);
    assert.deepEqual(texts(lib.terminalToolHead("Edit", { file_path: "b.js" })), ["edit b.js"]);
    assert.deepEqual(texts(lib.terminalToolHead("write", { path: "c.md" })), ["write c.md"]);
    assert.deepEqual(texts(lib.terminalToolHead("grep", { pattern: "todo", path: "src", glob: "*.js" })), ["grep todo src *.js"]);
    assert.deepEqual(texts(lib.terminalToolHead("ls", {})), ["ls"]);
    assert.deepEqual(lib.terminalToolHead("Agent", { description: "x" }), [
      { text: "Agent", cls: "cmd" }, { text: "{", cls: "args" }, { text: '  "description": "x"', cls: "args" }, { text: "}", cls: "args" },
    ]);
    assert.deepEqual(lib.terminalToolHead("", null), [{ text: "ferramenta", cls: "cmd" }]);
  });

  test("subagentStats mirrors the pi-subagents stats line", () => {
    assert.deepEqual(lib.subagentStats(), []);
    assert.deepEqual(lib.subagentStats({ modelName: "haiku", tags: ["thinking: high"], turnCount: 2, maxTurns: 30, toolUses: 1, tokens: "3k token", cost: 0.123 }),
      ["haiku", "thinking: high", "↻ 2/30", "1 ferramenta", "3k token", "US$ 0.12"]);
    assert.deepEqual(lib.subagentStats({ turnCount: 3, toolUses: 4, cost: 0, tags: "x" }), ["↻ 3", "4 ferramentas"]);
  });

  test("terminalToolBody: diffs, live subagent status, output, errors, cap", () => {
    const edit = { name: "edit", status: "done", isError: false, args: { path: "a" }, result: { details: { diff: "-1 a\n+1 b" } } };
    assert.deepEqual(lib.terminalToolBody(edit), { hidden: 0, lines: [{ text: "-1 a", cls: "del" }, { text: "+1 b", cls: "add" }] });
    const write = { name: "write", status: "running", isError: false, args: { path: "a", content: "x\ny" }, result: null };
    assert.deepEqual(lib.terminalToolBody(write, 1), { hidden: 1, lines: [{ text: "+ y", cls: "add" }] });
    const agent = (activity) => ({ name: "Agent", status: "running", isError: false, result: { content: [{ type: "text", text: "2 tool uses..." }], details: { status: "running", toolUses: 2, activity } } });
    assert.deepEqual(texts(lib.terminalToolBody(agent("reading…")).lines), ["2 ferramentas", "└ reading…"]);
    assert.deepEqual(texts(lib.terminalToolBody(agent("")).lines), ["2 ferramentas", "└ pensando…"]);
    const partial = { name: "bash", status: "running", isError: false, result: { content: [{ type: "text", text: "l1\nl2" }], details: {} } };
    assert.deepEqual(lib.terminalToolBody(partial).lines, [{ text: "l1", cls: "out" }, { text: "l2", cls: "out" }]);
    const failedEdit = { name: "edit", status: "error", isError: true, args: { path: "a" }, result: { content: [{ type: "text", text: "no match" }] } };
    assert.deepEqual(lib.terminalToolBody(failedEdit).lines, [{ text: "no match", cls: "err" }]);
    assert.deepEqual(lib.terminalToolBody({ name: "bash", status: "error", isError: true, result: null }).lines, [{ text: "✗ falhou", cls: "err" }]);
    assert.deepEqual(lib.terminalToolBody({ name: "bash", status: "pending", isError: false, result: null }).lines, []);
  });

  test("buildTerminal flattens history + live runtime + notices in protocol order", () => {
    const messages = [
      { role: "user", content: [{ type: "text", text: "oi\nmais" }, { type: "image", data: "AA" }] },
      null,
      { role: "user", content: "" },
      { role: "assistant", content: "string reply" },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "  " },
          { type: "thinking", thinking: "plan" },
          { type: "text", text: " " },
          { type: "text", text: "vou rodar" },
          { type: "toolCall", id: "c1", name: "bash", arguments: { command: "ls" } },
          { type: "toolCall", name: "read" },
          { type: "toolCall", id: "c3", name: "bash", arguments: { command: "sleep 1" } },
          { type: "toolCall", id: "c4", name: "bash", arguments: { command: "true" } },
          null,
        ],
        stopReason: "error",
        errorMessage: "boom",
      },
      { role: "toolResult", toolCallId: "c1", content: [{ type: "text", text: "a.txt" }], isError: false },
      { role: "toolResult", toolName: "grep", content: [{ type: "text", text: "nope" }], isError: true },
      { role: "assistant", content: [], stopReason: "aborted" },
      { role: "assistant", content: [], stopReason: "error" },
      { role: "bashExecution", command: "git status", output: "clean", exitCode: 0 },
      { role: "bashExecution", command: "false", exitCode: 1 },
      { role: "bashExecution", command: "sleep", cancelled: true },
      { role: "custom", display: false, content: "hidden" },
      { role: "custom", customType: "subagent-notification", content: "<task/>" },
      { role: "custom", content: [{ type: "text", text: "nota" }] },
      { role: "compactionSummary", summary: "resumo" },
      { role: "branchSummary" },
      { role: "mystery" },
      { role: "assistant" },
      { role: "bashExecution", command: "tail -f x", output: "l1", _live: true },
      { role: "bashExecution", command: "boom", output: "x", failed: true },
    ];
    const runtime = new Map([
      ["c3", { name: "bash", status: "running", partial: { content: [{ type: "text", text: "tick" }] } }],
      ["c4", { name: "bash", status: "done", result: null, partial: null }],
      ["c1", { name: "bash", status: "error", result: { content: [] } }],
      ["live", { name: "write", status: "running" }],
    ]);
    const notices = [{ id: 2, at: 99, level: "dim", text: "fim" }, { id: 1, at: 0, level: "warn", text: "início" }, { id: 3, at: 5, level: "err", text: "meio" }];
    const blocks = lib.buildTerminal(messages, runtime, notices, 400);
    const view = blocks.map((block) => [block.key, block.kind, block.status, [...block.head, ...block.lines].map((line) => `${line.cls}:${line.text}`).join("|")]);
    assert.deepEqual(view, [
      ["n:1", "notice", "", "warn:início"],
      ["u:0", "user", "", "user:> oi|user:  mais|dim:  [1 imagem]"],
      ["u:2", "user", "", "user:> "],
      ["a:3.0", "assistant", "", ":string reply"],
      ["k:4.1", "thinking", "", "think:plan"],
      ["a:4.3", "assistant", "", ":vou rodar"],
      ["t:4.4", "tool", "done", "cmd:$ ls|out:a.txt"],
      ["t:4.5", "tool", "pending", "cmd:read "],
      ["t:4.6", "tool", "running", "cmd:$ sleep 1|out:tick"],
      ["t:4.7", "tool", "done", "cmd:$ true"],
      ["e:4", "notice", "", "err:✗ boom"],
      ["n:3", "notice", "", "err:meio"],
      ["r:6", "tool", "error", "cmd:grep|err:nope"],
      ["e:7", "notice", "", "warn:■ Interrompido"],
      ["b:9", "tool", "done", "cmd:$ git status|out:clean"],
      ["b:10", "tool", "error", "cmd:$ false|err:✗ falhou"],
      ["b:11", "tool", "error", "cmd:$ sleep|err:✗ falhou"],
      ["c:13", "custom", "", "dim:[subagent-notification]|out:<task/>"],
      ["c:14", "custom", "", "dim:[extensão]|out:nota"],
      ["d:15", "divider", "", "rule:Contexto compactado|dim:resumo"],
      ["d:16", "divider", "", "rule:Resumo do ramo"],
      ["b:19", "tool", "running", "cmd:$ tail -f x|out:l1"],
      ["b:20", "tool", "error", "cmd:$ boom|err:x"],
      ["l:live", "tool", "running", "cmd:write |add:+ "],
      ["n:2", "notice", "", "dim:fim"],
    ]);
    // Signatures are stable for identical content and change when streamed output grows.
    assert.deepEqual(lib.buildTerminal(messages, runtime, notices).map((block) => block.sig), blocks.map((block) => block.sig));
    runtime.get("c3").partial = { content: [{ type: "text", text: "tick\ntock" }] };
    const grown = lib.buildTerminal(messages, runtime, notices).find((block) => block.key === "t:4.6");
    assert.notEqual(grown.sig, blocks.find((block) => block.key === "t:4.6").sig);
    assert.match(blocks.find((block) => block.key === "t:4.6").sig, /^tool\|running\|0\|1\|1\|/);
    assert.deepEqual(lib.buildTerminal(), []);
    const capped = lib.buildTerminal([], new Map([["x", { name: "bash", status: "done", result: { content: [{ type: "text", text: "1\n2\n3" }] } }]]), [], 2);
    assert.equal(capped[0].hidden, 1);
  });

  test("eventNotice turns live-only protocol events into terminal lines", () => {
    assert.deepEqual(lib.eventNotice({ type: "compaction_start", reason: "manual" }), { level: "dim", text: "◌ Compactando contexto (manual)…" });
    assert.equal(lib.eventNotice({ type: "compaction_start" }).text, "◌ Compactando contexto…");
    assert.equal(lib.eventNotice({ type: "compaction_end", aborted: true }).level, "warn");
    assert.deepEqual(lib.eventNotice({ type: "compaction_end", errorMessage: "quota" }), { level: "err", text: "✗ Falha ao compactar: quota" });
    assert.equal(lib.eventNotice({ type: "compaction_end", result: { tokensBefore: 150000, estimatedTokensAfter: 32000 } }).text, "◆ Contexto compactado: 150k → ~32k tokens");
    assert.equal(lib.eventNotice({ type: "compaction_end", result: { tokensBefore: 1500 } }).text, "◆ Contexto compactado: 1.5k tokens");
    assert.equal(lib.eventNotice({ type: "compaction_end", result: null }).text, "◆ Contexto compactado");
    assert.deepEqual(lib.eventNotice({ type: "auto_retry_start", attempt: 1, maxAttempts: 3, delayMs: 2000, errorMessage: "529" }), { level: "warn", text: "↻ Nova tentativa 1/3 em 2 s · 529" });
    assert.equal(lib.eventNotice({ type: "auto_retry_start", attempt: 2, maxAttempts: 3, delayMs: 0 }).text, "↻ Nova tentativa 2/3 em 0 s");
    assert.deepEqual(lib.eventNotice({ type: "auto_retry_end", success: true, attempt: 2 }), { level: "dim", text: "↻ Tentativa 2 bem-sucedida" });
    assert.equal(lib.eventNotice({ type: "auto_retry_end", success: false, attempt: 3, finalError: "x" }).text, "✗ Falhou após 3 tentativas: x");
    assert.equal(lib.eventNotice({ type: "auto_retry_end", success: false, attempt: 3 }).text, "✗ Falhou após 3 tentativas: erro desconhecido");
    assert.deepEqual(lib.eventNotice({ type: "extension_error", error: "bad" }), { level: "err", text: "✗ Erro de extensão: bad" });
    assert.deepEqual(lib.eventNotice({ type: "extension_ui_request", method: "notify", message: "\x1b[31mok\x1b[0m" }), { level: "info", text: "• ok" });
    assert.equal(lib.eventNotice({ type: "extension_ui_request", method: "notify", message: "w", notifyType: "warning" }).level, "warn");
    assert.equal(lib.eventNotice({ type: "extension_ui_request", method: "notify", message: "e", notifyType: "error" }).level, "err");
    assert.equal(lib.eventNotice({ type: "extension_ui_request", method: "setStatus" }), null);
    assert.equal(lib.eventNotice({ type: "turn_start" }), null);
    assert.equal(lib.eventNotice(null), null);
  });
});

describe("subagents", () => {
  const NOW = 1_000_000;
  const call = (id, args, name = "Agent") => ({ type: "toolCall", id, name, arguments: args });
  const result = (id, text, details, isError = false) => ({ role: "toolResult", toolCallId: id, toolName: "Agent", content: [{ type: "text", text }], details, isError });

  test("subagentPhase / subagentRecords", () => {
    assert.deepEqual(["running", "queued", "background", "completed", "steered", "error", "aborted", "stopped", undefined].map(lib.subagentPhase),
      ["running", "running", "running", "done", "done", "error", "error", "error", "error"]);
    assert.equal(lib.subagentRecords(null).size, 0);
    const records = lib.subagentRecords([
      null,
      { type: "custom", customType: "subagents:record", data: { id: "a1", status: "completed" } },
      { type: "custom", customType: "subagents:record", data: {} },
      { type: "custom", customType: "other", data: { id: "x" } },
      { type: "message", data: { id: "y" } },
    ]);
    assert.deepEqual([...records.keys()], ["a1"]);
  });

  test("foreground run: live partial (AgentDetails.activity) then final result", () => {
    const fgArgs = { description: "Mapear rotas", subagent_type: "Explore", prompt: "liste rotas" };
    const messages = [{ role: "assistant", timestamp: NOW - 9000, content: [{ type: "text", text: "x" }, call("fg", fgArgs)] }];
    const partial = { content: [{ type: "text", text: "2 tool uses..." }], details: { displayName: "Explore", subagentType: "Explore", modelName: "haiku", toolUses: 2, tokens: "4k token", status: "running", activity: "reading…", durationMs: 800 } };
    const running = lib.collectSubagents(messages, new Map([["fg", { name: "Agent", status: "running", partial, startedAt: NOW - 3000 }]]), new Map(), NOW);
    assert.equal(running.length, 1);
    assert.deepEqual({ ...running[0], sections: undefined }, {
      key: "sa:0.1", agentId: "", name: "", title: "Explore", type: "Explore", description: "Mapear rotas", model: "haiku",
      stats: ["haiku", "2 ferramentas", "4k token"], status: "running", phase: "running", background: false, elapsed: 3000,
      tail: ["└ reading…"], sections: undefined, order: 0, startedAt: NOW - 3000, endedAt: null, stalled: null,
    });
    assert.deepEqual(running[0].sections, [{ label: "Tarefa", text: "liste rotas" }]);
    const noActivity = lib.collectSubagents(messages, new Map([["fg", { name: "Agent", status: "running", partial: { details: { status: "running" } } }]]), new Map(), NOW);
    assert.deepEqual(noActivity[0].tail, ["└ pensando…"]);
    assert.equal(noActivity[0].elapsed, 9000, "falls back to the assistant message timestamp");

    const finalDetails = { ...partial.details, status: "completed", agentId: "ag1", durationMs: 2700, activity: undefined };
    const done = lib.collectSubagents([...messages, result("fg", "Agent completed.\n\nlinha 1\n\nlinha 2\nlinha 3\nlinha 4", finalDetails)],
      new Map([["fg", { name: "Agent", status: "done", result: null, startedAt: NOW - 3000 }], ["other", { name: "bash", status: "running" }]]), new Map(), NOW);
    assert.equal(done.length, 1);
    assert.equal(done[0].phase, "done");
    assert.equal(done[0].elapsed, 2700);
    assert.deepEqual(done[0].tail, ["linha 2", "linha 3", "linha 4"]);
    assert.equal(done[0].sections[1].label, "Resultado");

    const endedLive = lib.collectSubagents(messages, new Map([["fg", { name: "Agent", status: "done", result: { content: [{ type: "text", text: "ok" }], details: finalDetails } }]]), new Map(), NOW);
    assert.equal(endedLive[0].phase, "done");
    assert.deepEqual(endedLive[0].tail, ["ok"]);
  });

  test("background run: launch result, steer/get_result, notification and record", () => {
    const bgArgs = { description: "Auditar", subagent_type: "general-purpose", name: "deps-audit", prompt: "audite", model: "sonnet" };
    const launch = result("bg", "Agent started in background.\nAgent ID: ag2", { displayName: "general-purpose", subagentType: "general-purpose", status: "background", agentId: "ag2", toolUses: 0, tokens: "", durationMs: 0 });
    const messages = [
      { role: "assistant", timestamp: "1970-01-01T00:16:30.000Z", content: [call("bg", bgArgs)] },
      launch,
      { role: "assistant", content: [call("st", { agent_id: "DEPS-AUDIT", message: "foque em CVEs" }, "steer_subagent"), call("gr", { agent_id: "ag2" }, "get_subagent_result"), call("gx", { agent_id: "ninguem" }, "get_subagent_result"), call("g0", {}, "get_subagent_result"), call("s0", { agent_id: "general-purpose" }, "steer_subagent")] },
      { role: "toolResult", toolCallId: "st", content: [{ type: "text", text: "Steering sent" }] },
      { role: "toolResult", toolCallId: "gr", content: [{ type: "text", text: "Agent is still running." }] },
      { role: "assistant", content: "plain" },
    ];
    const running = lib.collectSubagents(messages, new Map(), new Map(), NOW);
    assert.equal(running[0].phase, "running");
    assert.equal(running[0].background, true);
    assert.equal(running[0].elapsed, NOW - 990_000);
    assert.deepEqual(running[0].tail, ["Em segundo plano · ag2"]);
    assert.equal(running[0].title, "deps-audit");
    assert.equal(running[0].model, "sonnet");
    assert.deepEqual(running[0].sections.map((section) => `${section.label}=${section.text}`), [
      "Tarefa=audite", "Início=Agent started in background.\nAgent ID: ag2", "Direcionamento=foque em CVEs", "Consulta de resultado=Agent is still running.", "Direcionamento=",
    ]);

    const note = { id: "ag2", description: "Auditar (nota)", status: "completed", toolUses: 7, turnCount: 4, totalTokens: 22800, totalCost: 0.04, durationMs: 3600, outputFile: "/tmp/ag2.jsonl", resultPreview: "2 desatualizadas", others: [{ id: "ag9", status: "error", error: "falhou" }, { status: "x" }] };
    const notified = lib.collectSubagents([...messages, { role: "custom", customType: "subagent-notification", details: note }, { role: "custom", customType: "subagent-notification" }, { role: "custom", customType: "other", details: { id: "ag2" } }], new Map(), new Map(), NOW);
    assert.equal(notified[0].phase, "done");
    assert.equal(notified[0].elapsed, 3600);
    assert.deepEqual(notified[0].stats, ["↻ 4", "7 ferramentas", "23k tokens", "US$ 0.04"]);
    assert.deepEqual(notified[0].tail, ["2 desatualizadas"]);
    assert.deepEqual(notified[0].sections.map((section) => section.label).slice(0, 4), ["Tarefa", "Início", "Resultado", "Transcrição completa"]);

    const quiet = lib.collectSubagents([...messages, { role: "custom", customType: "subagent-notification", details: { id: "ag2", status: "stopped", others: "nope" } }], new Map(), new Map(), NOW);
    assert.equal(quiet[0].phase, "error");
    assert.equal(quiet[0].elapsed, 0);
    assert.deepEqual(quiet[0].stats, []);
    assert.deepEqual(quiet[0].tail, ["Agent started in background.", "Agent ID: ag2"]);

    const records = new Map([["ag2", { id: "ag2", status: "error", error: "sem rede", result: "parcial", startedAt: NOW - 5000, completedAt: NOW - 1000 }]]);
    const failed = lib.collectSubagents(messages, new Map(), records, NOW);
    assert.equal(failed[0].phase, "error");
    assert.equal(failed[0].elapsed, 4000);
    assert.deepEqual(failed[0].tail, ["sem rede"]);
    assert.deepEqual(failed[0].sections.map((section) => section.label).slice(0, 4), ["Tarefa", "Início", "Resultado", "Erro"]);
    const openRecord = lib.collectSubagents(messages, new Map(), new Map([["ag2", { id: "ag2", status: "completed", completedAt: NOW }]]), NOW);
    assert.equal(openRecord[0].elapsed, 0, "a record without startedAt does not invent a duration");
  });

  test("errors, refusals, waiting calls, orphans and ordering", () => {
    const messages = [
      { role: "assistant", timestamp: "not a date", content: [null, call("e1", { description: "quebrou", subagent_type: "Explore" }), { type: "toolCall", id: "w1", name: "Agent" }] },
      result("e1", "Agent failed: timeout\npartial line", { status: "error", subagentType: "Explore", description: "det", durationMs: 50 }, false),
      { role: "assistant", timestamp: NOW - 100, content: [call("r1", { subagent_type: "Nope" }), call("x1", {}), call("x2", { prompt: "" })] },
      result("r1", 'Unknown agent type "Nope"'),
      result("x1", "crash\n\nstack", undefined, true),
      result("x2", "", { error: "det err" }, true),
    ];
    const runtime = new Map([["orphan", { name: "Agent", status: "running" }], ["e1", { name: "Agent", status: "done", startedAt: NOW - 70 }]]);
    const runs = lib.collectSubagents(messages, runtime, new Map(), NOW);
    const view = runs.map((run) => [run.key, run.phase, run.title, run.description, run.tail.join("/"), run.elapsed]);
    assert.deepEqual(view, [
      ["sa:live:orphan", "running", "Agente", "", "Aguardando início…", 0],
      ["sa:0.2", "running", "Agente", "", "Aguardando início…", 0],
      ["sa:2.2", "error", "Agente", "", "det err", 0],
      ["sa:2.1", "error", "Agente", "", "crash/stack", 0],
      ["sa:2.0", "error", "Nope", "", 'Unknown agent type "Nope"', 0],
      ["sa:0.1", "error", "Explore", "quebrou", "Agent failed: timeout/partial line", 50],
    ]);
    assert.deepEqual(runs.find((run) => run.key === "sa:2.2").sections, [{ label: "Erro", text: "det err" }]);
    assert.equal(lib.collectSubagents([{ role: "assistant", content: [call("d", {})] }], new Map(), new Map(), NOW)[0].description, "");
    const described = lib.collectSubagents([{ role: "assistant", content: [call("d", {})] }, result("d", "ok", { status: "completed", description: "from details" })]);
    assert.equal(described[0].description, "from details");
    const fromNote = lib.collectSubagents([{ role: "assistant", content: [call("d", {})] }, result("d", "bg", { status: "background", agentId: "n1" }), { role: "custom", customType: "subagent-notification", details: { id: "n1", status: "completed", description: "da nota", totalTokens: 0, durationMs: 5 } }]);
    assert.equal(fromNote[0].description, "da nota");
    assert.deepEqual(fromNote[0].tail, []);
    assert.deepEqual(lib.collectSubagents(), []);
  });
});

describe("context breakdown", () => {
  test("maps get_session_stats + get_state into the Contexto view", () => {
    const stats = {
      sessionFile: "/s.jsonl", userMessages: 5, assistantMessages: 5, toolCalls: 12, totalMessages: 22,
      tokens: { input: 50000, output: 10000, cacheRead: 40000, cacheWrite: 0, total: 105000 }, cost: 0.45,
      contextUsage: { tokens: 60000, contextWindow: 200000, percent: 30 },
    };
    const data = lib.contextBreakdown(stats, { model: { id: "m", name: "Model", provider: "p", reasoning: true }, thinkingLevel: "high", sessionFile: "/other" });
    assert.deepEqual(data.usage, { percent: 30, tokens: 60000, contextWindow: 200000 });
    assert.deepEqual(data.parts.map((part) => [part.label, part.value, part.share]), [["Entrada", 50000, 0.5], ["Saída", 10000, 0.1], ["Cache lido", 40000, 0.4], ["Cache gravado", 0, 0]]);
    assert.equal(data.total, 105000);
    assert.equal(data.cost, 0.45);
    assert.deepEqual(data.counts.map((item) => item.value), [5, 5, 12, 22]);
    assert.equal(data.model, "Model");
    assert.equal(data.provider, "p");
    assert.equal(data.thinking, "Alto");
    assert.equal(data.sessionFile, "/s.jsonl");

    const empty = lib.contextBreakdown(null, null);
    assert.deepEqual(empty, { usage: null, parts: [], total: null, cost: null, counts: [], model: "", provider: "", thinking: "", sessionFile: "" });
    const zero = lib.contextBreakdown({ tokens: { input: 0, output: Number.NaN } }, { model: { id: "m", reasoning: false }, thinkingLevel: "high", sessionFile: "/f" });
    assert.deepEqual(zero.parts, [{ label: "Entrada", value: 0, share: 0 }]);
    assert.equal(zero.thinking, "");
    assert.equal(zero.provider, "");
    assert.equal(zero.sessionFile, "/f");
    assert.equal(lib.contextBreakdown({}, { model: { id: "m" } }).thinking, "");
  });
});

describe("composer: slash commands", () => {
  test("sourceLabel names each command origin", () => {
    assert.deepEqual(["studio", "extension", "skill", "prompt", "nope", undefined].map(lib.sourceLabel), ["Studio", "extensão", "skill", "prompt", "comando", "comando"]);
  });

  test("mergeCommands puts Studio built-ins first and drops colliding or malformed PI entries", () => {
    const merged = lib.mergeCommands([
      { name: "fix-tests", description: "Fix", source: "prompt" },
      { name: "compact", description: "extension compact", source: "extension" },
      { name: "skill:x", source: "skill" },
      { name: "bare", description: 7 },
      { name: "" },
      { description: "sem nome" },
      null,
    ]);
    assert.deepEqual(merged.map((command) => command.name), ["new", "compact", "name", "export", "atalhos", "fix-tests", "skill:x", "bare"]);
    assert.equal(merged.find((command) => command.name === "compact").source, "studio");
    assert.deepEqual(merged.slice(5), [
      { name: "fix-tests", args: "", description: "Fix", source: "prompt" },
      { name: "skill:x", args: "", description: "", source: "skill" },
      { name: "bare", args: "", description: "", source: "extension" },
    ]);
    assert.equal(lib.mergeCommands(undefined).length, 5);
    assert.equal(lib.mergeCommands("lixo").length, 5);
  });

  test("slashQuery only applies while the whole composer is a single /word", () => {
    assert.equal(lib.slashQuery("/"), "");
    assert.equal(lib.slashQuery("/com"), "com");
    assert.equal(lib.slashQuery("/skill:brave"), "skill:brave");
    for (const text of ["", "oi", " /new", "/new ", "/new arg", "/a\nb", "texto /x"]) assert.equal(lib.slashQuery(text), null, JSON.stringify(text));
    assert.equal(lib.slashQuery(undefined), null);
  });

  test("filterCommands ranks name prefix, name substring, then description", () => {
    const commands = [
      { name: "skill:brave-search", description: "Web search" },
      { name: "fix-tests", description: "Fix failing tests" },
      { name: "retest", description: "" },
      { name: "deploy" },
      { name: "Test", description: "x" },
    ];
    assert.deepEqual(lib.filterCommands(commands, "test").map((command) => command.name), ["Test", "fix-tests", "retest"]);
    assert.deepEqual(lib.filterCommands(commands, "fail").map((command) => command.name), ["fix-tests"]);
    assert.deepEqual(lib.filterCommands(commands, "").map((command) => command.name), commands.map((command) => command.name));
    assert.deepEqual(lib.filterCommands(commands, "BRAVE").map((command) => command.name), ["skill:brave-search"]);
    assert.deepEqual(lib.filterCommands(commands, "zzz"), []);
    assert.equal(lib.filterCommands(commands, undefined).length, 5);
    assert.deepEqual(lib.filterCommands(lib.STUDIO_COMMANDS, "c").map((command) => command.name), ["compact", "new", "name", "export", "atalhos"]);
  });

  test("slashCompletion adds the separating space", () => {
    assert.equal(lib.slashCompletion({ name: "compact" }), "/compact ");
  });

  test("slashEnterSubmits: exact PI commands and argument-free built-ins submit; others complete", () => {
    const [newCommand, compact, name] = lib.STUDIO_COMMANDS;
    assert.equal(lib.slashEnterSubmits(newCommand, "new"), true);
    assert.equal(lib.slashEnterSubmits(compact, "compact"), true);
    assert.equal(lib.slashEnterSubmits(name, "name"), false);
    assert.equal(lib.slashEnterSubmits(newCommand, "ne"), false);
    assert.equal(lib.slashEnterSubmits({ name: "fix", args: "", source: "prompt" }, "fix"), true);
    assert.equal(lib.slashEnterSubmits({ name: "fix", args: "", source: "prompt" }, "fi"), false);
  });

  test("parseBuiltin recognizes Studio built-ins with trimmed arguments only", () => {
    assert.deepEqual(lib.parseBuiltin("/new"), { name: "new", args: "" });
    assert.deepEqual(lib.parseBuiltin("  /COMPACT  foco no código  \n"), { name: "compact", args: "foco no código" });
    assert.deepEqual(lib.parseBuiltin("/name Meu título\ncom linhas"), { name: "name", args: "Meu título\ncom linhas" });
    assert.deepEqual(lib.parseBuiltin("/atalhos"), { name: "atalhos", args: "" });
    for (const text of ["", "/", "/fix-tests", "oi /new", "new", "/skill:x arg", undefined]) assert.equal(lib.parseBuiltin(text), null, JSON.stringify(text));
  });
});

describe("composer: @ mentions", () => {
  test("mentionToken finds an @word at a word boundary around the caret", () => {
    assert.deepEqual(lib.mentionToken("@", 1), { start: 0, end: 1, query: "" });
    assert.deepEqual(lib.mentionToken("veja @src/ap", 12), { start: 5, end: 12, query: "src/ap" });
    assert.deepEqual(lib.mentionToken("veja @src/ap", undefined), { start: 5, end: 12, query: "src/ap" });
    assert.deepEqual(lib.mentionToken("a\n@x y", 4), { start: 2, end: 4, query: "x" });
    // Caret inside the word: the whole word is replaced.
    assert.deepEqual(lib.mentionToken("ver @src/app.js agora", 7), { start: 4, end: 15, query: "sr" });
    // Out-of-range carets clamp.
    assert.deepEqual(lib.mentionToken("@ab", 99), { start: 0, end: 3, query: "ab" });
    assert.equal(lib.mentionToken("@ab", -5), null);
    for (const [text, cursor] of [["", 0], ["mail a@b.com", 12], ["@a b", 4], ["sem arroba", 4], ["@@x", 3], ["a @b c", 6]]) {
      assert.equal(lib.mentionToken(text, cursor), null, JSON.stringify([text, cursor]));
    }
    assert.equal(lib.mentionToken(undefined, 0), null);
  });

  test("insertMention replaces the token, adds one space and places the caret after it", () => {
    const token = lib.mentionToken("veja @src/ap", 12);
    assert.deepEqual(lib.insertMention("veja @src/ap", token, "src/app.js"), { text: "veja @src/app.js ", cursor: 17 });
    const middle = lib.mentionToken("ver @sr agora", 7);
    assert.deepEqual(lib.insertMention("ver @sr agora", middle, "src/a.js"), { text: "ver @src/a.js agora", cursor: 14 });
    const quoted = lib.mentionToken("@do", 3);
    assert.deepEqual(lib.insertMention("@do", quoted, "docs/meu arquivo.md"), { text: '@"docs/meu arquivo.md" ', cursor: 23 });
    assert.deepEqual(lib.insertMention(undefined, { start: 0, end: 0 }, "a"), { text: "@a ", cursor: 3 });
  });

  test("rankFiles: basename prefix > basename substring > path substring, shorter then alphabetical, limited", () => {
    const files = ["docs/app-guide.md", "src/app.js", "src/lib/happy.js", "app.js", "src/app/index.js", "README.md", "src/Apple.js", "src/app.js"];
    assert.deepEqual(lib.rankFiles(files, "app"), ["app.js", "src/app.js", "src/app.js", "src/Apple.js", "docs/app-guide.md", "src/lib/happy.js", "src/app/index.js"]);
    assert.deepEqual(lib.rankFiles(files, "APP.JS", 2), ["app.js", "src/app.js"]);
    assert.deepEqual(lib.rankFiles(["b/x.js", "a/x.js"], "x"), ["a/x.js", "b/x.js"]);
    assert.deepEqual(lib.rankFiles(files, "readme"), ["README.md"]);
    assert.deepEqual(lib.rankFiles(files, "nada"), []);
    assert.equal(lib.rankFiles(files, "").length, files.length);
    assert.equal(lib.rankFiles(files, undefined).length, files.length);
    assert.equal(lib.rankFiles(Array.from({ length: 80 }, (_, i) => `f${i}.js`), "f").length, 50);
  });
});

describe("composer: shell mode", () => {
  test("isShellText / shellCommand", () => {
    assert.equal(lib.isShellText("!ls"), true);
    assert.equal(lib.isShellText("  !ls"), true);
    assert.equal(lib.isShellText("ls !"), false);
    assert.equal(lib.isShellText(""), false);
    assert.equal(lib.isShellText(undefined), false);
    assert.equal(lib.shellCommand("!ls -la "), "ls -la");
    assert.equal(lib.shellCommand("  ! git status"), "git status");
    assert.equal(lib.shellCommand("!"), "");
    assert.equal(lib.shellCommand(undefined), "");
  });

  test("bashState and bashLabels", () => {
    assert.equal(lib.bashState({ _live: true, exitCode: 1 }), "running");
    assert.equal(lib.bashState({ cancelled: true, exitCode: 1 }), "cancelled");
    assert.equal(lib.bashState({ exitCode: 2 }), "error");
    assert.equal(lib.bashState({ failed: true }), "error");
    assert.equal(lib.bashState({ exitCode: 0 }), "done");
    assert.equal(lib.bashState({}), "done");
    assert.deepEqual(lib.bashLabels({ state: "running" }), ["em execução"]);
    assert.deepEqual(lib.bashLabels({ state: "done", truncated: true }), ["concluído", "truncado"]);
    assert.deepEqual(lib.bashLabels({ state: "cancelled" }), ["cancelado"]);
    assert.deepEqual(lib.bashLabels({ state: "error", exitCode: 127 }), ["código 127"]);
    assert.deepEqual(lib.bashLabels({ state: "error", exitCode: null }), ["falhou"]);
  });

  test("appendBashOutput streams chunks and keeps only the newest 200k characters", () => {
    const block = { output: "" };
    lib.appendBashOutput(block, "a\n");
    lib.appendBashOutput(block, undefined);
    lib.appendBashOutput(block, "b");
    assert.equal(block.output, "a\nb");
    lib.appendBashOutput(block, "x".repeat(250_000));
    assert.equal(block.output.length, 200_000);
    assert.equal(block.output.endsWith("x"), true);
    lib.appendBashOutput(block, "z");
    assert.equal(block.output.length, 200_000);
    assert.equal(block.output.endsWith("xz"), true);
  });

  test("finishBash applies the final bash response or its failure", () => {
    const ok = lib.finishBash({ _live: true, output: "streamed" }, { success: true, data: { output: "final", exitCode: 3, cancelled: false, truncated: true } });
    assert.deepEqual(ok, { _live: false, output: "final", exitCode: 3, cancelled: false, truncated: true });
    const keepsStream = lib.finishBash({ _live: true, output: "streamed" }, { success: true, data: { cancelled: true } });
    assert.deepEqual(keepsStream, { _live: false, output: "streamed", exitCode: 0, cancelled: true, truncated: false });
    const noData = lib.finishBash({ _live: true, output: "" }, { success: true });
    assert.deepEqual(noData, { _live: false, output: "", exitCode: 0, cancelled: false, truncated: false });
    const failed = lib.finishBash({ _live: true, output: "parcial" }, { success: false, error: "Sem shell" });
    assert.deepEqual(failed, { _live: false, output: "parcial\nSem shell", failed: true });
    const bare = lib.finishBash({ _live: true, output: "" }, undefined);
    assert.deepEqual(bare, { _live: false, output: "Falha ao executar o comando.", failed: true });
    assert.equal(lib.bashState(failed), "error");
  });

  test("reconcileEntries keeps a Studio shell block until PI's own bashExecution entry exists", () => {
    const local = { role: "bashExecution", command: "ls", output: "a", timestamp: 10_000, _bash: true };
    assert.deepEqual(lib.reconcileEntries([], [local]), [local]);
    const persisted = { role: "bashExecution", command: "ls", output: "a", exitCode: 0, timestamp: 10_050 };
    assert.deepEqual(lib.reconcileEntries([persisted], [local]), [persisted]);
    assert.deepEqual(lib.reconcileEntries([{ ...persisted, timestamp: undefined }], [local]).length, 1);
    // An older run of the same command, or another command, does not hide the new block.
    assert.deepEqual(lib.reconcileEntries([{ ...persisted, timestamp: 1_000 }], [local]).length, 2);
    assert.deepEqual(lib.reconcileEntries([{ ...persisted, command: "pwd" }], [local]).length, 2);
    assert.deepEqual(lib.reconcileEntries([{ role: "user", command: "ls" }], [local]).length, 2);
  });

  test("shell blocks re-render when status or output changes", () => {
    const [running] = lib.buildTimeline([{ role: "bashExecution", command: "make", output: "a", _live: true }]);
    const [grown] = lib.buildTimeline([{ role: "bashExecution", command: "make", output: "ab", _live: true }]);
    const [done] = lib.buildTimeline([{ role: "bashExecution", command: "make", output: "ab", exitCode: 0, truncated: true }]);
    const signatures = [running, grown, done].map(lib.timelineSignature);
    assert.equal(new Set(signatures).size, 3);
  });
});

describe("keyboard shortcuts", () => {
  const key = (name, extra = {}) => ({ key: name, ...extra });

  test("shortcutAction maps global shortcuts", () => {
    assert.equal(lib.shortcutAction(key("/", { ctrlKey: true })), "shortcuts");
    assert.equal(lib.shortcutAction(key("/", { metaKey: true }), { typing: true }), "shortcuts");
    assert.equal(lib.shortcutAction(key("`", { ctrlKey: true })), "console");
    assert.equal(lib.shortcutAction(key("O", { ctrlKey: true, shiftKey: true })), "new");
    assert.equal(lib.shortcutAction(key("o", { metaKey: true, shiftKey: true })), "new");
    assert.equal(lib.shortcutAction(key("o", { ctrlKey: true })), null);
    assert.equal(lib.shortcutAction(key("x", { ctrlKey: true, shiftKey: true })), null);
    assert.equal(lib.shortcutAction(key("Escape")), "escape");
    assert.equal(lib.shortcutAction(key("Escape"), { typing: true }), "escape");
    assert.equal(lib.shortcutAction(key("/")), "focus");
    assert.equal(lib.shortcutAction(key("/"), { typing: true }), null);
    assert.equal(lib.shortcutAction(key("/", { shiftKey: true })), null);
    assert.equal(lib.shortcutAction(key("a")), null);
    assert.equal(lib.shortcutAction(key("/", { altKey: true })), null);
    assert.equal(lib.shortcutAction(key("/", { ctrlKey: true, isComposing: true })), null);
    assert.equal(lib.shortcutAction(null), null);
    assert.equal(lib.shortcutAction({}), null);
  });

  test("recallAction: ArrowUp recalls into an empty composer; ArrowDown/Esc clear a recalled message", () => {
    assert.equal(lib.recallAction(key("ArrowUp"), { empty: true, recalled: false }), "recall");
    assert.equal(lib.recallAction(key("ArrowUp"), { empty: false, recalled: true }), null);
    assert.equal(lib.recallAction(key("ArrowDown"), { empty: false, recalled: true }), "clear");
    assert.equal(lib.recallAction(key("Escape"), { empty: false, recalled: true }), "clear");
    assert.equal(lib.recallAction(key("Escape"), { empty: true, recalled: false }), null);
    assert.equal(lib.recallAction(key("ArrowDown"), { empty: true, recalled: false }), null);
    assert.equal(lib.recallAction(key("a"), { empty: true, recalled: true }), null);
    for (const modifier of ["shiftKey", "ctrlKey", "metaKey", "altKey", "isComposing"]) {
      assert.equal(lib.recallAction(key("ArrowUp", { [modifier]: true }), { empty: true, recalled: false }), null, modifier);
    }
    assert.equal(lib.recallAction(null, { empty: true, recalled: true }), null);
  });

  test("SHORTCUT_GROUPS documents every shortcut with keys and a label", () => {
    assert.ok(lib.SHORTCUT_GROUPS.length >= 3);
    for (const group of lib.SHORTCUT_GROUPS) {
      assert.ok(group.title && group.items.length);
      for (const item of group.items) assert.ok(item.keys.length && item.keys.every(Boolean) && item.label);
    }
    const all = lib.SHORTCUT_GROUPS.flatMap((group) => group.items.map((item) => item.keys.join("+")));
    for (const combo of ["Esc", "Ctrl+/", "Ctrl+Shift+O", "Ctrl+`", "↑", "Enter", "Ctrl+Enter", "Shift+Enter"]) assert.ok(all.includes(combo), combo);
  });
});

describe("wave 2: message actions, task list, notifications", () => {
  const ev = (key, extra = {}) => ({ key, ...extra });

  test("Alt+T toggles the task list; Ctrl+T (browser-reserved), Alt+Shift+T and plain t do not", () => {
    assert.equal(lib.shortcutAction(ev("t", { altKey: true })), "todos");
    assert.equal(lib.shortcutAction(ev("†", { altKey: true, code: "KeyT" }), { typing: true }), "todos");
    assert.equal(lib.shortcutAction(ev("t", { altKey: true, shiftKey: true })), null);
    assert.equal(lib.shortcutAction(ev("t", { altKey: true, ctrlKey: true })), null);
    assert.equal(lib.shortcutAction(ev("t", { altKey: true, metaKey: true })), null);
    assert.equal(lib.shortcutAction(ev("x", { altKey: true })), null);
    assert.equal(lib.shortcutAction(ev("t", { ctrlKey: true })), null);
    assert.equal(lib.shortcutAction(ev("t")), null);
    assert.ok(lib.SHORTCUT_GROUPS.flatMap((group) => group.items).some((item) => item.keys.join("+") === "Alt+T"));
  });

  test("forkEntryIds pairs user messages with get_fork_messages by order", () => {
    const forks = [{ entryId: "a", text: "primeira" }, { entryId: "b", text: "segunda  pergunta" }];
    assert.deepEqual(lib.forkEntryIds(["primeira", "segunda pergunta"], forks), ["a", "b"]);
    // a message not yet known to PI (just sent) is left without an id
    assert.deepEqual(lib.forkEntryIds(["primeira", "segunda pergunta", "nova"], forks), ["a", "b", null]);
    // the first mismatch hides itself and everything after it, even if a later text matches again
    assert.deepEqual(lib.forkEntryIds(["outra", "segunda pergunta"], forks), [null, null]);
    assert.deepEqual(lib.forkEntryIds(["primeira", "diferente", "x"], [...forks, { entryId: "c", text: "x" }]), ["a", null, null]);
    // malformed entries and missing lists never guess
    assert.deepEqual(lib.forkEntryIds(["primeira"], [{ text: "primeira" }]), [null]);
    assert.deepEqual(lib.forkEntryIds(["primeira"], null), [null]);
    assert.deepEqual(lib.forkEntryIds([], forks), []);
    assert.deepEqual(lib.forkEntryIds(["x"], [{ entryId: "k", text: null }]), [null]);
  });

  test("messageActions: copy always; edit/retry need a verified fork point and an idle agent", () => {
    const ids = (item, ctx) => lib.messageActions(item, ctx).map((action) => action.id);
    const flags = (item, ctx) => lib.messageActions(item, ctx).map((action) => action.disabled);
    const user = { kind: "user", entryId: "e1", images: [], optimistic: false };
    assert.deepEqual(ids(user), ["copy", "edit"]);
    assert.deepEqual(flags(user, {}), [false, false]);
    assert.deepEqual(flags(user, { streaming: true }), [false, true]);
    assert.deepEqual(flags(user, { busy: true }), [false, true]);
    assert.deepEqual(ids({ ...user, entryId: null }), ["copy"]);
    assert.deepEqual(ids({ ...user, images: [{ data: "x" }] }), ["copy"]);
    assert.deepEqual(ids({ ...user, optimistic: true }), ["copy"]);
    assert.deepEqual(ids({ kind: "user", entryId: "e1" }), ["copy", "edit"]);

    const assistant = { kind: "assistant", text: "oi" };
    assert.deepEqual(ids(assistant), ["copy"]);
    assert.deepEqual(ids(assistant, { lastAssistant: true }), ["copy"]);
    assert.deepEqual(ids(assistant, { retryId: "e1" }), ["copy"]);
    assert.deepEqual(ids(assistant, { lastAssistant: true, retryId: "e1" }), ["copy", "retry"]);
    assert.deepEqual(flags(assistant, { lastAssistant: true, retryId: "e1", streaming: true }), [false, true]);
    assert.deepEqual(lib.messageActions(assistant, { lastAssistant: true, retryId: "e1" })[1].label, "Tentar de novo");
  });

  const tasks = [
    { id: 1, subject: "Ler o código", status: "completed", activeForm: "lendo" },
    { id: 2, subject: "Escrever testes", status: "in_progress", activeForm: "escrevendo testes" },
    { id: 3, subject: "Remover", status: "deleted" },
    { id: 4, subject: "Publicar", status: "pending", description: "ignorado" },
  ];
  const result = (details, extra = {}) => ({ role: "toolResult", toolName: "todo", isError: false, details, ...extra });

  test("todoSnapshot accepts valid snapshots and ignores everything else", () => {
    const snapshot = lib.todoSnapshot(result({ action: "list", tasks, nextId: 5 }));
    assert.deepEqual(snapshot.map((task) => [task.id, task.status, task.activeForm]), [[1, "completed", "lendo"], [2, "in_progress", "escrevendo testes"], [3, "deleted", ""], [4, "pending", ""]]);
    assert.deepEqual(Object.keys(snapshot[3]), ["id", "subject", "status", "activeForm"]);
    assert.deepEqual(lib.todoSnapshot({ toolName: "todo", details: { tasks: [], nextId: 1 } }), []);
    assert.equal(lib.todoSnapshot(result({ tasks, nextId: 5 }, { isError: true })), null);
    assert.equal(lib.todoSnapshot(result({ tasks, nextId: 5 }, { toolName: "bash" })), null);
    assert.equal(lib.todoSnapshot(result({ tasks })), null);
    assert.equal(lib.todoSnapshot(result({ tasks: "x", nextId: 1 })), null);
    assert.equal(lib.todoSnapshot(result({ tasks, nextId: "5" })), null);
    assert.equal(lib.todoSnapshot(result(null)), null);
    assert.equal(lib.todoSnapshot(result("texto")), null);
    assert.equal(lib.todoSnapshot(null), null);
    assert.equal(lib.isTodoDetails(undefined), false);
    // junk inside a valid envelope is dropped task by task
    const messy = lib.todoSnapshot(result({ nextId: 9, tasks: [null, 7, { id: "x", subject: "a", status: "pending" }, { id: 1, subject: 5, status: "pending" }, { id: 2, subject: "ok", status: "weird" }, { id: 3, subject: "bom", status: "pending", activeForm: 4 }] }));
    assert.deepEqual(messy, [{ id: 3, subject: "bom", status: "pending", activeForm: "" }]);
  });

  test("todoFromMessages: the last valid todo result wins; errors and junk are skipped", () => {
    const first = result({ tasks: [{ id: 1, subject: "a", status: "pending" }], nextId: 2 });
    const second = result({ tasks, nextId: 5 });
    const broken = result({ tasks: [{ id: 1, subject: "a", status: "completed" }], nextId: 2 }, { isError: true });
    assert.equal(lib.todoFromMessages([first, second, broken, result({ nope: true }), { role: "assistant", toolName: "todo", details: { tasks: [], nextId: 1 } }, null]).length, 4);
    assert.deepEqual(lib.todoFromMessages([first]).map((task) => task.subject), ["a"]);
    assert.equal(lib.todoFromMessages([broken, { role: "user" }]), null);
    assert.equal(lib.todoFromMessages([]), null);
    assert.equal(lib.todoFromMessages(undefined), null);
  });

  test("todoSummary hides deleted tasks, counts done and names the current one", () => {
    const summary = lib.todoSummary(lib.todoSnapshot(result({ tasks, nextId: 5 })));
    assert.deepEqual([summary.done, summary.total, summary.current], [1, 3, "escrevendo testes"]);
    assert.deepEqual(summary.tasks.map((task) => task.id), [1, 2, 4]);
    const noForm = lib.todoSummary([{ id: 1, subject: "Sem forma", status: "in_progress", activeForm: "" }]);
    assert.equal(noForm.current, "Sem forma");
    assert.deepEqual(lib.todoSummary([{ id: 1, subject: "x", status: "pending", activeForm: "" }]), { tasks: [{ id: 1, subject: "x", status: "pending", activeForm: "" }], done: 0, total: 1, current: "" });
    assert.deepEqual(lib.todoSummary(null), { tasks: [], done: 0, total: 0, current: "" });
  });

  test("notifications: preference, gating, text and dot priority", () => {
    assert.equal(lib.NOTIFY_KEY, "pi-studio:notify");
    assert.equal(lib.notifyEnabled(null), true);
    assert.equal(lib.notifyEnabled("1"), true);
    assert.equal(lib.notifyEnabled("lixo"), true);
    assert.equal(lib.notifyEnabled("0"), false);

    const base = { enabled: true, permission: "granted", hidden: true, focused: true };
    assert.equal(lib.shouldNotify(base), true);
    assert.equal(lib.shouldNotify({ ...base, hidden: false, focused: false }), true);
    assert.equal(lib.shouldNotify({ ...base, hidden: false, focused: true }), false);
    assert.equal(lib.shouldNotify({ ...base, enabled: false }), false);
    assert.equal(lib.shouldNotify({ ...base, permission: "denied" }), false);
    assert.equal(lib.shouldNotify({ ...base, permission: "default" }), false);
    assert.equal(lib.shouldNotify({}), false);

    assert.deepEqual(lib.notificationContent("done", { project: "amphipod", text: "\n  Tudo pronto.\r\nSegunda linha" }), { title: "PI terminou em amphipod", body: "Tudo pronto." });
    assert.equal(lib.notificationContent("done", { project: "p", text: "x".repeat(200) }).body, `${"x".repeat(139)}…`);
    assert.deepEqual(lib.notificationContent("done"), { title: "PI terminou em o projeto", body: "" });
    assert.equal(lib.notificationContent("done", { text: null }).body, "");
    assert.deepEqual(lib.notificationContent("input", { title: "Permitir?\ndetalhe", text: "ignorado" }), { title: "PI precisa da sua resposta", body: "Permitir?" });
    assert.equal(lib.notificationContent("input", { text: "Mensagem do diálogo" }).body, "Mensagem do diálogo");
    assert.deepEqual(lib.notificationContent("input"), { title: "PI precisa da sua resposta", body: "" });

    assert.equal(lib.attentionState({ waiting: true, unseen: true }), "waiting");
    assert.equal(lib.attentionState({ waiting: false, unseen: true }), "unseen");
    assert.equal(lib.attentionState({ waiting: false, unseen: false }), "");
  });
});

describe("wave 3: search, palette, settings", () => {
  const key = (k, extra = {}) => ({ key: k, ...extra });

  test("foldText ignores case and accents and keeps positions aligned", () => {
    assert.equal(lib.foldText("Ação ÇÃO Café"), "acao cao cafe");
    assert.equal(lib.foldText("cafe\u0301"), "cafe");
    assert.equal(lib.foldText(null), "");
    assert.equal(lib.foldText(undefined), "");
    // A lone combining mark and decomposed Hangul have no 1:1 fold and stay as they are.
    assert.equal(lib.foldText("\u0301x"), "\u0301x");
    assert.equal(lib.foldText("가").length, "가".length);
    for (const text of ["Ação", "İstanbul", "𐐀𐐨 ß", "e\u0301\u0301"]) assert.equal(lib.foldText(text).length, text.normalize("NFC").length, text);
  });

  test("searchSnippet returns the first match with context and ellipses", () => {
    const folded = lib.foldText("autenticação");
    assert.equal(lib.searchSnippet("Preciso de AUTENTICAÇÃO segura", folded), "Preciso de AUTENTICAÇÃO segura");
    assert.equal(lib.searchSnippet("nada aqui", folded), "");
    assert.equal(lib.searchSnippet("qualquer", ""), "");
    assert.equal(lib.searchSnippet(null, folded), "");
    const long = `${"a".repeat(100)}\n  meio   alvo  ${"b".repeat(100)}`;
    const snippet = lib.searchSnippet(long, "alvo");
    assert.equal(snippet, `…${"a".repeat(50)} meio alvo ${"b".repeat(58)}…`);
    assert.equal(lib.searchSnippet("abcdefghij", "e", 2), "…cdefg…");
    assert.equal(lib.searchSnippet("abcdefghij", "b", 2), "abcd…");
    assert.equal(lib.searchSnippet("abcdefghij", "i", 2), "…ghij");
    // Decomposed input matches composed queries and the snippet is the composed text.
    assert.equal(lib.searchSnippet("cafe\u0301 quente", "cafe"), "café quente");
  });

  test("rankPalette orders prefix, word prefix, substring, then sub/keywords; ties keep order", () => {
    const items = [
      { label: "Abrir aba Terminal" },
      { label: "Exportar conversa", keywords: "salvar html" },
      { label: "Nova conversa" },
      { label: "Conversa recente", sub: "projeto-x/src" },
      { label: "Alternar Inspector" },
      { label: "Terminal", sub: "painel" },
    ];
    assert.deepEqual(lib.rankPalette(items, "conv").map((item) => item.label), ["Conversa recente", "Exportar conversa", "Nova conversa"]);
    assert.deepEqual(lib.rankPalette(items, "TERM").map((item) => item.label), ["Terminal", "Abrir aba Terminal"]);
    assert.deepEqual(lib.rankPalette(items, "versa").map((item) => item.label), ["Exportar conversa", "Nova conversa", "Conversa recente"]);
    assert.deepEqual(lib.rankPalette(items, "salvar").map((item) => item.label), ["Exportar conversa"]);
    assert.deepEqual(lib.rankPalette(items, "projeto-x").map((item) => item.label), ["Conversa recente"]);
    assert.deepEqual(lib.rankPalette(items, "painel").map((item) => item.label), ["Terminal"]);
    assert.deepEqual(lib.rankPalette(items, "zzz"), []);
    assert.equal(lib.rankPalette(items, "").length, 6);
    assert.equal(lib.rankPalette(items, "   ", 2).length, 2);
    assert.equal(lib.rankPalette(items, "a", 1).length, 1);
    assert.deepEqual(lib.rankPalette([{ label: "Ação rápida" }], "acao").map((item) => item.label), ["Ação rápida"]);
    const slashed = `a${String.fromCharCode(92)}b`;
    assert.deepEqual(lib.rankPalette([{ label: slashed }, { label: "c" }], "b").map((item) => item.label), [slashed]);
  });

  test("paletteSections ranks groups, keeps raw groups as given and drops empty ones", () => {
    const sections = lib.paletteSections([
      { title: "Ações", items: [{ label: "Nova conversa" }, { label: "Atalhos" }], limit: 5 },
      { title: "Conversas", items: [{ label: "Outra" }] },
      { title: "Resultados", items: [{ label: "x1" }, { label: "x2" }, { label: "x3" }], raw: true, limit: 2 },
      { title: "Vazio", items: [], raw: true },
    ], "nova");
    assert.deepEqual(sections.map((section) => [section.title, section.items.length]), [["Ações", 1], ["Resultados", 2]]);
    assert.equal(lib.paletteSections([{ title: "R", items: [{ label: "a" }, { label: "b" }], raw: true }], "q")[0].items.length, 2);
  });

  test("Ctrl/Cmd+K opens the palette, even while typing", () => {
    assert.equal(lib.shortcutAction(key("k", { ctrlKey: true })), "palette");
    assert.equal(lib.shortcutAction(key("K", { metaKey: true }), { typing: true }), "palette");
    assert.equal(lib.shortcutAction(key("k", { ctrlKey: true, shiftKey: true })), null);
    assert.equal(lib.shortcutAction(key("k")), null);
    assert.ok(lib.SHORTCUT_GROUPS.flatMap((group) => group.items).some((item) => item.keys.join("+") === "Ctrl+K"));
  });

  test("parseSettings validates every field and falls back to defaults", () => {
    assert.deepEqual(lib.DEFAULT_SETTINGS, { fontSize: "medium", chatWidth: "normal", reduceMotion: false, orcaEnabled: null, orcaChosen: false, orcaFollow: false });
    for (const raw of [null, undefined, "", "{oops", "null", "5", '"x"', "[]", "{}"]) assert.deepEqual(lib.parseSettings(raw), lib.DEFAULT_SETTINGS, String(raw));
    assert.deepEqual(lib.parseSettings('{"fontSize":"large","chatWidth":"wide","reduceMotion":true}'), { ...lib.DEFAULT_SETTINGS, fontSize: "large", chatWidth: "wide", reduceMotion: true });
    assert.deepEqual(lib.parseSettings('{"orcaEnabled":true,"orcaChosen":true,"orcaFollow":true}'), { ...lib.DEFAULT_SETTINGS, orcaEnabled: true, orcaChosen: true, orcaFollow: true });
    assert.deepEqual(lib.parseSettings('{"orcaEnabled":false,"orcaChosen":true}'), { ...lib.DEFAULT_SETTINGS, orcaEnabled: false, orcaChosen: true });
    // Legacy saves (no orcaChosen) and a chosen flag without a boolean stay undecided.
    assert.deepEqual(lib.parseSettings('{"orcaEnabled":false}'), lib.DEFAULT_SETTINGS);
    assert.deepEqual(lib.parseSettings('{"orcaChosen":true}'), lib.DEFAULT_SETTINGS);
    assert.deepEqual(lib.parseSettings('{"orcaEnabled":"yes","orcaFollow":1}'), lib.DEFAULT_SETTINGS);
    assert.deepEqual(lib.parseSettings('{"fontSize":"huge","chatWidth":3,"reduceMotion":"yes"}'), lib.DEFAULT_SETTINGS);
    assert.deepEqual(lib.parseSettings('{"fontSize":"small"}'), { ...lib.DEFAULT_SETTINGS, fontSize: "small" });
    assert.equal(lib.SETTINGS_KEY, "pi-studio:settings");
    assert.deepEqual(lib.settingsAttributes({ fontSize: "large", chatWidth: "wide", reduceMotion: true }), { font: "large", width: "wide", motion: "reduce" });
    assert.deepEqual(lib.settingsAttributes(lib.DEFAULT_SETTINGS), { font: "medium", width: "normal", motion: "normal" });
  });

  test("boot.js applies exactly what parseSettings/settingsAttributes produce", async () => {
    const source = await readFile(new URL("../public/boot.js", import.meta.url), "utf8");
    const boot = (getItem) => {
      const dataset = {};
      vm.runInNewContext(source, { localStorage: { getItem }, document: { documentElement: { dataset } } });
      return { ...dataset };
    };
    for (const raw of [null, "{oops", "null", "5", "[]", '{"fontSize":"small","chatWidth":"wide","reduceMotion":true}', '{"fontSize":"nope","chatWidth":"normal"}', '{"reduceMotion":"true"}']) {
      assert.deepEqual(boot(() => raw), lib.settingsAttributes(lib.parseSettings(raw)), String(raw));
    }
    assert.deepEqual(boot(() => { throw new Error("storage blocked"); }), lib.settingsAttributes(lib.DEFAULT_SETTINGS));
  });
});

describe("conversation states + worktrees overview", () => {
  const norm = (over = {}) => lib.normalizeOrca({ ok: true, result: { worktrees: [{ worktreeId: "r::/a", repo: "Repo", path: "C:/a/b", branch: "refs/heads/feat/x", displayName: "Nome", isActive: false, status: "inactive", unread: false, linkedIssue: null, linkedPR: null, comment: "", lastActivityAt: 5, agents: [], ...over }] } }).worktrees[0];

  test("orcaEnabledNow: an explicit choice wins, otherwise Orca's availability decides", () => {
    assert.equal(lib.orcaEnabledNow({ orcaEnabled: null }, true), true);
    assert.equal(lib.orcaEnabledNow({ orcaEnabled: null }, false), false);
    assert.equal(lib.orcaEnabledNow({ orcaEnabled: null }, undefined), false);
    assert.equal(lib.orcaEnabledNow({ orcaEnabled: false }, true), false);
    assert.equal(lib.orcaEnabledNow({ orcaEnabled: true }, false), true);
    assert.equal(lib.orcaEnabledNow(lib.parseSettings(null), true), true);
    // A legacy save (orcaEnabled:false written before the toggle existed) does not block the default.
    assert.equal(lib.orcaEnabledNow(lib.parseSettings('{"orcaEnabled":false,"fontSize":"large"}'), true), true);
    assert.equal(lib.orcaEnabledNow(lib.parseSettings('{"orcaEnabled":false,"orcaChosen":true}'), true), false);
  });

  test("sessionStateBadge maps each state to a label; nova and unknown states show nothing", () => {
    for (const state of ["pronto", "fazendo", "parado", "erro", "aguardando"]) {
      assert.deepEqual(lib.sessionStateBadge({ state }), { state, label: state, aria: `Estado: ${state}` });
    }
    for (const item of [{ state: "nova" }, { state: "xyz" }, {}, null, undefined]) assert.equal(lib.sessionStateBadge(item), null);
  });

  test("sessionTooltip: title, sub-PI marker and state label", () => {
    assert.equal(lib.sessionTooltip({ title: "scout#8f244a40", isSubagent: true, state: "fazendo" }), "scout#8f244a40 · sub-PI · fazendo");
    assert.equal(lib.sessionTooltip({ title: "Plano", state: "pronto" }), "Plano · pronto");
    assert.equal(lib.sessionTooltip({ state: "nova" }), "Nova conversa");
  });

  test("historyPollWanted: only while something runs or waits, and never in a hidden page", () => {
    assert.equal(lib.historyPollWanted([{ state: "pronto" }, { state: "fazendo" }], false), true);
    assert.equal(lib.historyPollWanted([{ state: "aguardando" }], false), true);
    assert.equal(lib.historyPollWanted([{ state: "pronto" }, { state: "parado" }, { state: "erro" }, { state: "nova" }], false), false);
    assert.equal(lib.historyPollWanted([{ state: "fazendo" }], true), false);
    assert.equal(lib.historyPollWanted([], false), false);
  });

  test("orcaAgentState: Orca states share the conversation vocabulary", () => {
    assert.deepEqual(lib.orcaAgentState({ state: "working" }), { key: "fazendo", label: "trabalhando" });
    assert.deepEqual(lib.orcaAgentState({ state: "done" }), { key: "pronto", label: "pronto" });
    assert.deepEqual(lib.orcaAgentState({ state: "blocked" }), { key: "aguardando", label: "aguardando" });
    assert.deepEqual(lib.orcaAgentState({ state: "waiting" }), { key: "aguardando", label: "aguardando" });
    assert.deepEqual(lib.orcaAgentState({ state: "error" }), { key: "erro", label: "erro" });
    assert.deepEqual(lib.orcaAgentState({ state: "failed" }), { key: "erro", label: "erro" });
    assert.deepEqual(lib.orcaAgentState({ state: "idle" }), { key: "parado", label: "parado" });
    assert.deepEqual(lib.orcaAgentState({ state: "working", interrupted: true }), { key: "parado", label: "parado" });
    assert.deepEqual(lib.orcaAgentState({ state: "novel" }), { key: "", label: "novel" });
    assert.deepEqual(lib.orcaAgentState({ state: "" }), { key: "", label: "—" });
  });

  test("studioPiState: the Studio's own PI for a worktree", () => {
    assert.equal(lib.studioPiState(null), null);
    assert.equal(lib.studioPiState(undefined), null);
    assert.equal(lib.studioPiState({ exited: true, streaming: true }), "parado");
    assert.equal(lib.studioPiState({ waitingUi: true, streaming: true }), "aguardando");
    assert.equal(lib.studioPiState({ streaming: true }), "fazendo");
    assert.equal(lib.studioPiState({ streaming: false }), "pronto");
  });

  test("filterWorktrees: name, branch and repo, ignoring case and accents", () => {
    const list = [
      { name: "Feature A", branch: "feat/açaí", repo: "Sanvera" },
      { name: "Outra", branch: "main", repo: "Evolvera" },
      { name: "Sem repo", branch: "", repo: "" },
    ];
    assert.equal(lib.filterWorktrees(list, ""), list);
    assert.equal(lib.filterWorktrees(list, "   "), list);
    assert.deepEqual(lib.filterWorktrees(list, "FEATURE").map((item) => item.name), ["Feature A"]);
    assert.deepEqual(lib.filterWorktrees(list, "acai").map((item) => item.name), ["Feature A"]);
    assert.deepEqual(lib.filterWorktrees(list, "evolv").map((item) => item.name), ["Outra"]);
    assert.deepEqual(lib.filterWorktrees(list, "main").map((item) => item.name), ["Outra"]);
    assert.deepEqual(lib.filterWorktrees(list, "zzz"), []);
  });

  test("groupWorktrees: by repository, best-ranked repository first, sorted inside, input untouched", () => {
    const list = [
      { name: "a-old", repo: "A", status: "inactive", active: false, lastActivityAt: 1 },
      { name: "b-busy", repo: "B", status: "working", active: false, lastActivityAt: 2 },
      { name: "a-new", repo: "A", status: "inactive", active: false, lastActivityAt: 9 },
      { name: "none", repo: "", status: "inactive", active: false, lastActivityAt: 0 },
    ];
    const groups = lib.groupWorktrees(list);
    assert.deepEqual(groups.map((group) => [group.repo, group.worktrees.map((item) => item.name)]), [["B", ["b-busy"]], ["A", ["a-new", "a-old"]], ["Sem repositório", ["none"]]]);
    assert.deepEqual(list.map((item) => item.name), ["a-old", "b-busy", "a-new", "none"]);
    assert.deepEqual(lib.groupWorktrees([]), []);
  });

  test("worktreeDetail: every field of an overview row, with Studio PI state and agents", () => {
    const now = 1_000_000_000_000;
    const full = norm({
      status: "working", unread: true, isActive: true, linkedIssue: 321, linkedPR: { number: 9, state: "draft" }, comment: "nota", liveTerminalCount: 3, lastActivityAt: now - 5 * 60_000,
      agents: [
        { state: "working", agentType: "pi", taskTitle: "Tarefa", lastAssistantMessage: "quase" },
        { state: "done", agentType: "claude", lastAssistantMessage: "" },
        { state: "done", interrupted: true },
        { state: "novel" },
      ],
    });
    assert.deepEqual(lib.worktreeDetail(full, { streaming: true }, now), {
      name: "Nome", sub: "feat/x", statusLabel: "trabalhando", running: true, active: true, unread: true,
      issue: "#321", pr: "PR #9 · draft", comment: "nota", terminals: "3 terminais", lastActivity: "5 min",
      studio: { key: "fazendo", label: "PI do Studio: fazendo" }, stalled: null,
      agents: [
        { key: "fazendo", label: "trabalhando", title: "Tarefa", message: "quase" },
        { key: "pronto", label: "pronto", title: "claude", message: "" },
        { key: "parado", label: "parado", title: "agente", message: "" },
        { key: "", label: "novel", title: "agente", message: "" },
      ],
    });
    const bare = lib.worktreeDetail(norm({ lastActivityAt: 0, linkedPR: 7, liveTerminalCount: 1 }), null);
    assert.deepEqual([bare.issue, bare.pr, bare.terminals, bare.lastActivity, bare.studio, bare.agents], ["", "PR #7", "1 terminal", "", null, []]);
    assert.equal(lib.worktreeDetail(norm({ linkedIssue: 1 }), undefined, 5).issue, "#1");
    assert.equal(lib.worktreeDetail(norm({ liveTerminalCount: -2 }), null).terminals, "");
    assert.equal(typeof lib.worktreeDetail(norm(), null).lastActivity, "string");
  });

  test("stepIndex wraps in both directions and survives an empty list", () => {
    assert.equal(lib.stepIndex(0, 1, 3), 1);
    assert.equal(lib.stepIndex(2, 1, 3), 0);
    assert.equal(lib.stepIndex(0, -1, 3), 2);
    assert.equal(lib.stepIndex(0, 1, 0), 0);
  });

  test("Alt+W opens the worktrees overview; Ctrl+Shift+W, Alt+Shift+W and plain w do not", () => {
    const ev = (key, extra = {}) => ({ key, ...extra });
    assert.equal(lib.shortcutAction(ev("w", { altKey: true })), "worktrees");
    assert.equal(lib.shortcutAction(ev("∑", { altKey: true, code: "KeyW" }), { typing: true }), "worktrees");
    assert.equal(lib.shortcutAction(ev("W", { altKey: true, shiftKey: true })), null);
    assert.equal(lib.shortcutAction(ev("w", { altKey: true, ctrlKey: true })), null);
    assert.equal(lib.shortcutAction(ev("w", { ctrlKey: true, shiftKey: true })), null);
    assert.equal(lib.shortcutAction(ev("w")), null);
    assert.equal(lib.shortcutAction(ev("x", { altKey: true })), null);
    assert.ok(lib.SHORTCUT_GROUPS.flatMap((group) => group.items).some((item) => item.keys.join("+") === "Alt+W"));
  });
});

describe("turn finish time", () => {
  const T0 = 1_700_000_000_000;
  const user = (offset, text = "pergunta") => ({ role: "user", content: text, timestamp: T0 + offset });
  const assistant = (offset, text = "resposta", extra = {}) => ({ role: "assistant", content: [{ type: "text", text }], timestamp: T0 + offset, ...extra });

  test("entriesToMessages stamps assistant messages with the time their entry was written", () => {
    const iso = new Date(T0 + 5000).toISOString();
    const entries = [
      { type: "message", id: "1", parentId: null, timestamp: new Date(T0).toISOString(), message: { role: "user", content: "q", timestamp: T0 } },
      { type: "message", id: "2", parentId: "1", timestamp: iso, message: { role: "assistant", content: [], timestamp: T0 + 1000 } },
      { type: "message", id: "3", parentId: "2", timestamp: "not a date", message: { role: "assistant", content: [] } },
      { type: "message", id: "4", parentId: "3", message: { role: "assistant", content: [] } },
    ];
    const messages = lib.entriesToMessages(entries);
    assert.equal(messages[0], entries[0].message, "user messages are passed through untouched");
    assert.deepEqual(messages[1], { role: "assistant", content: [], timestamp: T0 + 1000, _endedAt: T0 + 5000 });
    assert.equal(entries[1].message._endedAt, undefined, "the stored message is not mutated");
    assert.equal(messages[2], entries[2].message);
    assert.equal(messages[3], entries[3].message);
  });

  test("buildTimeline: the last assistant text of each turn gets endedAt and tookMs", () => {
    const items = lib.buildTimeline([
      user(0, "um"), assistant(2000, "parcial"), { role: "toolResult", toolCallId: "x", content: [], timestamp: T0 + 3000 }, assistant(4000, "fim um", { _endedAt: T0 + 134_000 }),
      user(200_000, "dois"), assistant(201_000, "fim dois"),
      user(300_000, "tres"), assistant(300_200, "rapido"),
    ]);
    const texts = items.filter((item) => item.kind === "assistant");
    assert.deepEqual(texts.map((item) => [item.text, item.endedAt, item.tookMs]), [
      ["parcial", undefined, undefined],
      ["fim um", T0 + 134_000, 134_000],
      ["fim dois", T0 + 201_000, 1000],
      ["rapido", T0 + 300_200, undefined],
    ]);
  });

  test("buildTimeline: no timestamps, a turn without text, or a leading assistant add nothing", () => {
    const plain = lib.buildTimeline([{ role: "user", content: "a" }, { role: "assistant", content: [{ type: "text", text: "b" }] }]);
    assert.equal("endedAt" in plain[1], false);
    const toolsOnly = lib.buildTimeline([user(0), { role: "assistant", content: [{ type: "toolCall", id: "t", name: "bash", arguments: {} }], timestamp: T0 + 5000 }]);
    assert.deepEqual(toolsOnly.map((item) => item.kind), ["user", "tools"]);
    const leading = lib.buildTimeline([assistant(5000, "sem pergunta")]);
    assert.deepEqual([leading[0].endedAt, leading[0].tookMs], [T0 + 5000, undefined]);
    const isoStamps = lib.buildTimeline([{ role: "user", content: "a", timestamp: new Date(T0).toISOString() }, assistant(9000)]);
    assert.equal(isoStamps[1].tookMs, 9000);
    const junk = lib.buildTimeline([{ role: "user", content: "a", timestamp: "oops" }, { role: "assistant", content: "texto", timestamp: Infinity }]);
    assert.equal("endedAt" in junk[1], false);
  });

  test("stampTurnEnd marks the last assistant message once", () => {
    assert.equal(lib.stampTurnEnd([]), false);
    assert.equal(lib.stampTurnEnd([null, { role: "user" }]), false);
    const messages = [{ role: "assistant" }, { role: "user" }, { role: "assistant" }];
    assert.equal(lib.stampTurnEnd(messages, 42), true);
    assert.deepEqual(messages.map((message) => message._endedAt), [undefined, undefined, 42]);
    assert.equal(lib.stampTurnEnd(messages, 99), false);
    assert.equal(messages[2]._endedAt, 42);
    const defaulted = [{ role: "assistant" }];
    lib.stampTurnEnd(defaulted);
    assert.equal(typeof defaulted[0]._endedAt, "number");
  });

  test("applyTurnFinish: finished turns show the time; the turn being streamed does not", () => {
    const make = () => [
      { kind: "user" },
      { kind: "assistant", endedAt: 10, tookMs: 5000 },
      { kind: "assistant", endedAt: 20 },
      { kind: "tools" },
      { kind: "user" },
      { kind: "assistant", endedAt: 30, tookMs: 7000 },
      { kind: "assistant" },
    ];
    const idle = make();
    lib.applyTurnFinish(idle, false);
    assert.deepEqual(idle.map((item) => [item.finishAt, item.finishTook]), [[undefined, undefined], [10, 5000], [20, undefined], [undefined, undefined], [undefined, undefined], [30, 7000], [undefined, undefined]]);
    const streaming = make();
    lib.applyTurnFinish(streaming, true);
    assert.deepEqual(streaming.map((item) => item.finishAt), [undefined, 10, 20, undefined, undefined, undefined, undefined], "only the earlier turn keeps its time");
    const noUser = [{ kind: "assistant", endedAt: 1 }];
    lib.applyTurnFinish(noUser, true);
    assert.equal(noUser[0].finishAt, undefined, "a lone streaming turn shows nothing");
    lib.applyTurnFinish(noUser, false);
    assert.equal(noUser[0].finishAt, 1);
  });

  test("finishedLabel: relative text, absolute time and duration in the tooltip", () => {
    const now = T0 + 10 * 60_000;
    const absolute = new Date(T0).toLocaleString("pt-BR");
    assert.deepEqual(lib.finishedLabel(T0, 134_000, now), { text: "terminou h\u00e1 10 min", title: `terminou em ${absolute} \u00b7 levou 2 min 14 s` });
    assert.deepEqual(lib.finishedLabel(T0, undefined, T0 + 59_000), { text: "terminou agora", title: `terminou em ${absolute}` });
    assert.equal(lib.finishedLabel(T0, 999, T0).title, `terminou em ${absolute}`, "under a second is not worth a duration");
    assert.equal(lib.finishedLabel(T0, Infinity, T0).title, `terminou em ${absolute}`);
    assert.equal(lib.finishedLabel(T0, 1000, T0).title, `terminou em ${absolute} \u00b7 levou 1 s`);
    assert.equal(lib.finishedLabel(new Date(T0).toISOString(), null, T0 + 3 * 3_600_000).text, "terminou h\u00e1 3 h");
    assert.equal(lib.finishedLabel(T0, null, T0 + 2 * 86_400_000).text, "terminou h\u00e1 2 d");
    const old = lib.finishedLabel(T0, null, T0 + 30 * 86_400_000).text;
    assert.ok(old.startsWith("terminou em ") && !old.includes("h\u00e1"), old);
    assert.equal(lib.finishedLabel(T0, null, T0 - 5000).text, "terminou agora", "clock skew never shows the future");
    assert.equal(lib.finishedLabel(undefined, 5000, T0), null);
    assert.equal(lib.finishedLabel("oops", 5000, T0), null);
    assert.equal(lib.finishedLabel(NaN, 5000, T0), null);
    assert.equal(typeof lib.finishedLabel(T0, 5000).text, "string");
  });
});

describe("count badges", () => {
  test("countBadge: hidden for zero and non-counts, capped at 99+", () => {
    for (const value of [0, -1, 1.5, NaN, "3", null, undefined]) assert.equal(lib.countBadge(value), null, String(value));
    assert.equal(lib.countBadge(1), "1");
    assert.equal(lib.countBadge(12), "12");
    assert.equal(lib.countBadge(99), "99");
    assert.equal(lib.countBadge(100), "99+");
  });

  test("runningSubagentCount counts only running runs", () => {
    assert.equal(lib.runningSubagentCount([]), 0);
    assert.equal(lib.runningSubagentCount([{ phase: "running" }, { phase: "done" }, { phase: "error" }, { phase: "running" }]), 2);
  });

  test("runningWorktreeCount: a working Orca agent or a streaming Studio PI, each worktree once", () => {
    const wt = (name, agents = [], projectId = null) => ({ name, agents, projectId });
    const status = { p2: { streaming: true }, p3: { streaming: true, waitingUi: true }, p4: { streaming: true, exited: true }, p5: { streaming: false } };
    const list = [
      wt("working", [{ state: "done" }, { state: "working" }]),
      wt("interrupted", [{ state: "working", interrupted: true }]),
      wt("idle", [{ state: "done" }]),
      wt("none"),
      wt("studio", [], "p2"),
      wt("both", [{ state: "working" }], "p2"),
      wt("waiting", [], "p3"),
      wt("exited", [], "p4"),
      wt("quiet", [], "p5"),
      wt("unknown project", [], "p9"),
    ];
    assert.equal(lib.runningWorktreeCount(list, (worktree) => (worktree.projectId ? status[worktree.projectId] : null)), 3);
    assert.equal(lib.runningWorktreeCount([], () => null), 0);
  });

  test("projectRunningCount: running conversations of a project, or its live PI when the list is unknown", () => {
    assert.equal(lib.projectRunningCount([{ state: "fazendo" }, { state: "pronto" }, { state: "fazendo" }], null), 2);
    assert.equal(lib.projectRunningCount([], { streaming: true }), 1);
    assert.equal(lib.projectRunningCount(undefined, { streaming: true }), 1);
    assert.equal(lib.projectRunningCount([{ state: "fazendo" }, { state: "fazendo" }], { streaming: true }), 2);
    assert.equal(lib.projectRunningCount([{ state: "pronto" }], { streaming: true, waitingUi: true }), 0);
    assert.equal(lib.projectRunningCount(null, undefined), 0);
  });
});

describe("visibility: stalled detection, timing, activity feed, usage", () => {
  const T0 = 1_700_000_000_000;
  const MIN = 60_000;
  const agentCall = (id, args) => ({ type: "toolCall", id, name: "Agent", arguments: args });
  const toolResult = (id, text, details) => ({ role: "toolResult", toolCallId: id, toolName: "Agent", content: [{ type: "text", text }], details, isError: false });

  test("stallThresholds: defaults, valid overrides, invalid values fall back", () => {
    assert.deepEqual(lib.stallThresholds(), { piMs: 3 * MIN, subagentMs: 5 * MIN });
    assert.deepEqual(lib.stallThresholds({ PI_STUDIO_STALL_PI_MS: "1500", PI_STUDIO_STALL_SUBAGENT_MS: "2500" }), { piMs: 1500, subagentMs: 2500 });
    assert.deepEqual(lib.stallThresholds({ PI_STUDIO_STALL_PI_MS: "0", PI_STUDIO_STALL_SUBAGENT_MS: "1.5" }), { piMs: 3 * MIN, subagentMs: 5 * MIN });
    assert.deepEqual(lib.stallThresholds({ PI_STUDIO_STALL_PI_MS: "abc", PI_STUDIO_STALL_SUBAGENT_MS: "-4" }), { piMs: 3 * MIN, subagentMs: 5 * MIN });
  });

  test("stalledMinutes / stallLabel / stalledPi: edges at the thresholds", () => {
    assert.equal(lib.stalledMinutes(T0, 3 * MIN, T0 + 3 * MIN), null, "exactly at the threshold is not stalled");
    assert.equal(lib.stalledMinutes(T0, 3 * MIN, T0 + 3 * MIN + 1), 3);
    assert.equal(lib.stalledMinutes(T0, 3 * MIN, T0 + 10 * MIN + 59_999), 10);
    assert.equal(lib.stalledMinutes(T0, 1500, T0 + 1501), 1, "sub-minute thresholds still read at least 1 min");
    assert.equal(lib.stalledMinutes(undefined, 1, T0), null);
    assert.equal(lib.stalledMinutes(NaN, 1, T0), null);
    assert.ok(lib.stalledMinutes(T0, 1) > 1_000_000, "now defaults to Date.now()");
    assert.equal(lib.stallLabel(4), "sem atividade há 4 min");
    assert.equal(lib.stallLabel(null), null);

    const streaming = { streaming: true, lastEventAt: T0 };
    assert.equal(lib.stalledPi(streaming, T0 + 3 * MIN), null);
    assert.equal(lib.stalledPi(streaming, T0 + 3 * MIN + 1), "sem atividade há 3 min");
    assert.equal(lib.stalledPi(streaming, T0 + 2 * MIN, 1000), "sem atividade há 2 min", "custom threshold");
    assert.equal(lib.stalledPi({ ...streaming, waitingUi: true }, T0 + 9 * MIN), null, "waiting for the user is not stalled");
    assert.equal(lib.stalledPi({ ...streaming, exited: true }, T0 + 9 * MIN), null);
    assert.equal(lib.stalledPi({ streaming: false, lastEventAt: T0 }, T0 + 9 * MIN), null, "idle PI is not stalled");
    assert.equal(lib.stalledPi(null, T0), null);
    assert.equal(typeof lib.stalledPi(streaming), "string", "now defaults to Date.now()");
  });

  test("worktreeDetail carries the stalled label of the Studio PI", () => {
    const worktree = { path: "/w", name: "w", branch: "", repo: "", status: "working", agents: [] };
    assert.equal(lib.worktreeDetail(worktree, { streaming: true, lastEventAt: T0 }, T0 + 4 * MIN).stalled, "sem atividade há 4 min");
    assert.equal(lib.worktreeDetail(worktree, { streaming: true, lastEventAt: T0 }, T0 + 4 * MIN, 5 * MIN).stalled, null);
    assert.equal(lib.worktreeDetail(worktree, null, T0).stalled, null);
  });

  test("agoLabel: agora / há N / em <data>", () => {
    assert.equal(lib.agoLabel(T0, T0 + 5_000), "agora");
    assert.equal(lib.agoLabel(T0, T0 + 2 * MIN), "há 2 min");
    assert.equal(lib.agoLabel(T0, T0 + 3 * 60 * MIN), "há 3 h");
    assert.equal(lib.agoLabel(T0, T0 + 3 * 24 * 60 * MIN), "há 3 d");
    assert.match(lib.agoLabel(T0, T0 + 30 * 24 * 60 * MIN), /^em /);
    assert.equal(lib.agoLabel("nope", T0), "");
    assert.equal(typeof lib.agoLabel(T0), "string", "now defaults to Date.now()");
  });

  test("subagentTiming: running, finished with and without end time / duration", () => {
    assert.deepEqual(lib.subagentTiming({ phase: "running", elapsed: 125_000, stalled: null }), { text: "rodando há 2 min 5 s", stalled: null });
    assert.deepEqual(lib.subagentTiming({ phase: "running", elapsed: 5000, stalled: "sem atividade há 6 min" }), { text: "rodando há 5 s", stalled: "sem atividade há 6 min" });
    assert.deepEqual(lib.subagentTiming({ phase: "done", elapsed: 70_000, endedAt: T0 }, T0 + 4 * MIN), { text: "terminou há 4 min · levou 1 min 10 s", stalled: null });
    assert.deepEqual(lib.subagentTiming({ phase: "error", elapsed: 500, endedAt: T0 }, T0 + 1000), { text: "terminou agora", stalled: null });
    assert.deepEqual(lib.subagentTiming({ phase: "done", elapsed: 3000, endedAt: null }), { text: "levou 3 s", stalled: null });
    assert.deepEqual(lib.subagentTiming({ phase: "done", elapsed: 0, endedAt: null }), { text: "", stalled: null });
    assert.match(lib.subagentTiming({ phase: "done", elapsed: 0, endedAt: T0 }).text, /^terminou /);
  });

  test("collectSubagents: end time, progress and stalled marker", () => {
    const args = { description: "Mapear", subagent_type: "Explore", prompt: "x" };
    const messages = [{ role: "assistant", timestamp: T0 - 9000, content: [agentCall("fg", args)] }];
    const partial = { details: { status: "running", activity: "lendo" } };
    const live = (extra) => new Map([["fg", { name: "Agent", status: "running", partial, startedAt: T0, ...extra }]]);
    const quiet = lib.collectSubagents(messages, live({ updatedAt: T0 + MIN }), new Map(), T0 + 6 * MIN + 1)[0];
    assert.equal(quiet.stalled, "sem atividade há 5 min");
    assert.equal(quiet.endedAt, null);
    assert.equal(lib.collectSubagents(messages, live({ updatedAt: T0 + MIN }), new Map(), T0 + 6 * MIN)[0].stalled, null, "exactly at the threshold");
    assert.equal(lib.collectSubagents(messages, live({}), new Map(), T0 + 1000, 1000)[0].stalled, null, "progress falls back to the start");
    assert.equal(lib.collectSubagents(messages, live({}), new Map(), T0 + 3 * MIN, 1000)[0].stalled, "sem atividade há 3 min");
    assert.equal(lib.collectSubagents(messages, live({ startedAt: undefined }), new Map(), T0 + 99 * MIN)[0].stalled, null, "no progress timestamp, no marker");
    const ended = lib.collectSubagents(messages, new Map([["fg", { name: "Agent", status: "done", result: { content: [], details: { status: "completed", durationMs: 2000 } }, startedAt: T0, endedAt: T0 + 2000 }]]), new Map(), T0 + MIN)[0];
    assert.equal(ended.endedAt, T0 + 2000);
    assert.equal(ended.stalled, null);

    const bg = [{ role: "assistant", timestamp: T0, content: [agentCall("bg", { ...args, name: "x" })] },
      toolResult("bg", "started", { status: "background", agentId: "ag9" })];
    const note = { role: "custom", customType: "subagent-notification", timestamp: T0 + 5 * MIN, details: { id: "ag9", status: "completed", durationMs: 4 * MIN, others: [{ id: "ag8", status: "completed" }, { noId: true }] } };
    assert.equal(lib.collectSubagents([...bg, note], new Map(), new Map(), T0 + 6 * MIN).find((run) => run.agentId === "ag9").endedAt, T0 + 5 * MIN);
    const recorded = lib.collectSubagents(bg, new Map(), new Map([["ag9", { id: "ag9", status: "completed", startedAt: T0, completedAt: T0 + 2 * MIN }]]), T0 + 6 * MIN)[0];
    assert.equal(recorded.endedAt, T0 + 2 * MIN);
    assert.equal(recorded.startedAt, T0);
    const running = lib.collectSubagents(bg, new Map(), new Map(), T0 + 6 * MIN)[0];
    assert.equal(running.endedAt, null);
    assert.equal(running.stalled, null, "background runs have no progress signal");
  });

  test("activityFromEvent: turn finished with duration (and willRetry / no start)", () => {
    const tracker = lib.newActivityTracker();
    assert.deepEqual(lib.activityFromEvent({ type: "agent_start" }, tracker, T0), []);
    assert.deepEqual(lib.activityFromEvent({ type: "agent_end", willRetry: true }, tracker, T0 + 1000), []);
    assert.deepEqual(lib.activityFromEvent({ type: "agent_end" }, tracker, T0 + 125_000), [{ kind: "turn", text: "Terminou a resposta · levou 2 min 5 s", durationMs: 125_000 }]);
    assert.deepEqual(lib.activityFromEvent({ type: "agent_end" }, tracker, T0 + 200_000), [{ kind: "turn", text: "Terminou a resposta", durationMs: null }], "start was consumed");
    assert.equal(lib.activityFromEvent({ type: "agent_start" }).length, 0, "default tracker and clock");
  });

  test("activityFromEvent: foreground and background subagents", () => {
    const tracker = lib.newActivityTracker();
    const start = (id, args) => lib.activityFromEvent({ type: "tool_execution_start", toolName: "Agent", toolCallId: id, args }, tracker, T0);
    assert.deepEqual(lib.activityFromEvent({ type: "tool_execution_start", toolName: "bash", toolCallId: "b" }, tracker, T0), []);
    assert.deepEqual(lib.activityFromEvent({ type: "tool_execution_end", toolName: "bash", toolCallId: "b" }, tracker, T0), []);
    assert.deepEqual(start("fg", { name: "auditor", subagent_type: "Explore" }), [{ kind: "subagent_start", text: "Subagente iniciado: auditor", name: "auditor", type: "Explore" }]);
    assert.equal(start("t", { subagent_type: "Plan" })[0].name, "Plan");
    assert.deepEqual(start("n"), [{ kind: "subagent_start", text: "Subagente iniciado: Agente", name: "Agente", type: "" }]);
    const end = (id, extra) => lib.activityFromEvent({ type: "tool_execution_end", toolName: "Agent", toolCallId: id, ...extra }, tracker, T0 + 90_000);
    assert.deepEqual(end("fg", { result: { details: { status: "completed" } } }), [{ kind: "subagent_end", text: "Subagente auditor terminou · levou 1 min 30 s", name: "auditor", type: "Explore", durationMs: 90_000, ok: true }]);
    assert.equal(end("t", { isError: true })[0].ok, false);
    assert.equal(end("unknown", { result: { details: { status: "error" } } })[0].text, "Subagente Agente falhou", "unknown call: no start, no duration");
    assert.equal(end("never", {})[0].ok, true, "no result at all counts as completed");

    // Background: the tool call ends at launch; the notification closes the run.
    start("bg", { name: "worker", subagent_type: "general-purpose" });
    assert.deepEqual(end("bg", { result: { details: { status: "background", agentId: "ag1" } } }), []);
    start("bg2", { name: "w2" });
    assert.equal(end("bg2", { result: { details: { status: "background" } } })[0].kind, "subagent_end", "background without agent id ends right away");
    start("bg3", { name: "w3" });
    assert.equal(end("bg3", { isError: true, result: { details: { status: "background", agentId: "ag3" } } })[0].ok, false, "a failed launch is an error");
    const notify = (details, message = {}) => lib.activityFromEvent({ type: "message_end", message: { role: "custom", customType: "subagent-notification", details, ...message } }, tracker, T0 + 10 * MIN);
    const done = notify({ id: "ag1", status: "completed", durationMs: 3 * MIN, others: [{ id: "ag2", status: "failed", description: "Outro", durationMs: "x" }, { nope: 1 }] });
    assert.deepEqual(done.map((item) => [item.text, item.ok]), [["Subagente worker terminou · levou 3 min 0 s", true], ["Subagente Outro falhou", false]]);
    assert.equal(notify({ id: "ag4", status: "completed" })[0].text, "Subagente Agente terminou");
    start("bg5", { name: "w5" });
    end("bg5", { result: { details: { status: "background", agentId: "ag5" } } });
    assert.equal(notify({ id: "ag5", status: "completed" })[0].durationMs, 10 * MIN, "falls back to launch -> notification time");
    assert.deepEqual(notify(undefined), []);
    assert.deepEqual(notify({ id: "x" }, { customType: "other" }), []);
    assert.deepEqual(notify({ id: "x" }, { role: "user" }), []);
    assert.deepEqual(lib.activityFromEvent({ type: "message_end" }, tracker, T0), []);
  });

  test("activityFromEvent: errors, retries, compaction, dialogs, process", () => {
    const map = (event) => lib.activityFromEvent(event, undefined, T0);
    assert.deepEqual(map({ type: "message_end", message: { role: "assistant", stopReason: "error", errorMessage: "429" } }), [{ kind: "error", text: "Erro do modelo: 429" }]);
    assert.equal(map({ type: "message_end", message: { role: "assistant", stopReason: "error" } })[0].text, "Erro do modelo: desconhecido");
    assert.deepEqual(map({ type: "message_end", message: { role: "assistant", stopReason: "stop" } }), []);
    assert.equal(map({ type: "compaction_end", errorMessage: "boom" })[0].text, "Falha ao compactar: boom");
    assert.deepEqual(map({ type: "compaction_end", aborted: true }), []);
    assert.deepEqual(map({ type: "compaction_end", result: {} }), [{ kind: "compaction", text: "Contexto compactado" }]);
    assert.equal(map({ type: "auto_retry_start", attempt: 1, maxAttempts: 3, errorMessage: "overloaded" })[0].text, "Nova tentativa 1/3 · overloaded");
    assert.equal(map({ type: "auto_retry_start", attempt: 2, maxAttempts: 3 })[0].text, "Nova tentativa 2/3");
    assert.deepEqual(map({ type: "auto_retry_end", success: true, attempt: 2 }), [{ kind: "retry", text: "Tentativa 2 bem-sucedida" }]);
    assert.deepEqual(map({ type: "auto_retry_end", success: false, attempt: 3, finalError: "fim" }), [{ kind: "error", text: "Falhou após 3 tentativas: fim" }]);
    assert.equal(map({ type: "auto_retry_end", success: false, attempt: 3 })[0].text, "Falhou após 3 tentativas: erro desconhecido");
    assert.deepEqual(map({ type: "extension_error", error: "x" }), [{ kind: "error", text: "Erro de extensão: x" }]);
    assert.deepEqual(map({ type: "extension_ui_request", id: "u1", method: "confirm", title: "\u001b[1mApagar?\u001b[0m" }), [{ kind: "ui_wait", text: "Aguardando sua resposta: Apagar?" }]);
    assert.equal(map({ type: "extension_ui_request", id: "u2", method: "input" })[0].text, "Aguardando sua resposta: input");
    assert.deepEqual(map({ type: "extension_ui_request", method: "select" }), [], "a dialog without id cannot be answered");
    assert.deepEqual(map({ type: "extension_ui_request", method: "notify", notifyType: "error", message: "ruim" }), [{ kind: "error", text: "Aviso de extensão: ruim" }]);
    assert.deepEqual(map({ type: "extension_ui_request", method: "notify", notifyType: "warning", message: "meh" }), []);
    assert.deepEqual(map({ type: "extension_ui_response", id: "u1" }), [{ kind: "ui_answered", text: "Resposta enviada" }]);
    assert.deepEqual(map({ type: "process_error", message: "ENOENT" }), [{ kind: "error", text: "Falha ao executar o PI: ENOENT" }]);
    assert.equal(map({ type: "process_exit", code: 1, signal: null })[0].text, "PI encerrado (código 1)");
    assert.equal(map({ type: "process_exit", code: null, signal: "SIGTERM" })[0].text, "PI encerrado (sinal SIGTERM)");
    assert.deepEqual(map({ type: "something_else" }), []);
    assert.deepEqual(map(undefined), []);
  });

  test("problemsFromEvent keeps errors and retries only, stamped", () => {
    assert.deepEqual(lib.problemsFromEvent({ type: "auto_retry_start", attempt: 1, maxAttempts: 2 }, T0), [{ kind: "retry", text: "Nova tentativa 1/2", at: T0 }]);
    assert.deepEqual(lib.problemsFromEvent({ type: "extension_error", error: "e" }, T0), [{ kind: "error", text: "Erro de extensão: e", at: T0 }]);
    assert.deepEqual(lib.problemsFromEvent({ type: "compaction_end", result: {} }, T0), []);
    assert.deepEqual(lib.problemsFromEvent({ type: "agent_start" }), []);
  });

  test("activity cursor sends the server epoch when available and tolerates its absence", () => {
    assert.equal(lib.activitySinceUrl(8, "run-1"), "/api/activity?since=8&epoch=run-1");
    assert.equal(lib.activitySinceUrl(8), "/api/activity?since=8");
  });

  test("activityDot / unseenActivity / activityRows", () => {
    assert.equal(lib.activityDot({ kind: "subagent_end", ok: true }), "pronto");
    assert.equal(lib.activityDot({ kind: "subagent_end", ok: false }), "erro");
    assert.deepEqual(["turn", "subagent_start", "ui_wait", "retry", "error", "exit", "compaction", "ui_answered"].map((kind) => lib.activityDot({ kind })), ["pronto", "fazendo", "aguardando", "aguardando", "erro", "parado", "", ""]);
    const items = [
      { seq: 1, at: T0, projectId: "a", projectName: "Alpha", kind: "turn", text: "Terminou a resposta" },
      { seq: 2, at: T0 + MIN, projectId: "b", projectName: "Beta", kind: "error", text: "Erro de extensão: falhou" },
      { seq: 3, at: T0 + 2 * MIN, projectId: "a", projectName: "Alpha", kind: "subagent_end", ok: true, text: "Subagente x terminou" },
    ];
    assert.equal(lib.unseenActivity(items, 0), 3);
    assert.equal(lib.unseenActivity(items, 2), 1);
    assert.equal(lib.unseenActivity(items, 3), 0);
    assert.equal(lib.unseenActivity([], 0), 0);
    const rows = lib.activityRows(items, "", T0 + 3 * MIN);
    assert.deepEqual(rows.map((row) => [row.seq, row.project, row.ago, row.dot]), [[3, "Alpha", "há 1 min", "pronto"], [2, "Beta", "há 2 min", "erro"], [1, "Alpha", "há 3 min", "pronto"]]);
    assert.deepEqual(lib.activityRows(items, "  EXTENSÃO ", T0 + 3 * MIN).map((row) => row.seq), [2]);
    assert.deepEqual(lib.activityRows(items, "alpha", T0 + 3 * MIN).map((row) => row.seq), [3, 1]);
    assert.deepEqual(lib.activityRows(items, "zzz"), []);
    assert.equal(rows[0].projectId, "a");
    assert.equal(rows[0].text, "Subagente x terminou");
  });

  test("localDay: local calendar day, around midnight", () => {
    assert.equal(lib.localDay(new Date(2025, 2, 7, 23, 59, 59).getTime()), "2025-03-07");
    assert.equal(lib.localDay(new Date(2025, 2, 8, 0, 0, 1).getTime()), "2025-03-08");
    assert.equal(lib.localDay(new Date(2025, 0, 2, 12).toISOString()), "2025-01-02");
    assert.equal(lib.localDay("nope"), null);
    assert.equal(lib.localDay(undefined), null);
  });

  test("addUsage / sumUsage / todayUsageRows", () => {
    const at = new Date(2025, 2, 7, 10).getTime();
    const days = {};
    lib.addUsage(days, at, { totalTokens: 100, cost: { total: 0.5 } });
    lib.addUsage(days, at, { input: 10, output: 20, cacheRead: 5, cacheWrite: 1, cost: { total: 0.25 } });
    lib.addUsage(days, at, { input: "x", cost: {} });
    lib.addUsage(days, at, null);
    lib.addUsage(days, "nope", { totalTokens: 9 });
    lib.addUsage(days, new Date(2025, 2, 6, 23, 59).getTime(), { totalTokens: 7 });
    assert.deepEqual(days, { "2025-03-07": { cost: 0.75, tokens: 136 }, "2025-03-06": { cost: null, tokens: 7 } });

    const entries = [{ usage: days }, { usage: { "2025-03-07": { cost: null, tokens: 4 } } }, { usage: { "2025-03-01": { cost: 9, tokens: 9 } } }, {}];
    assert.deepEqual(lib.sumUsage(entries, "2025-03-07"), { cost: 0.75, tokens: 140, sessions: 2 });
    assert.deepEqual(lib.sumUsage(entries, "2025-03-06"), { cost: null, tokens: 7, sessions: 1 });
    assert.deepEqual(lib.sumUsage(entries, "2030-01-01"), { cost: null, tokens: 0, sessions: 0 });

    assert.deepEqual(lib.todayUsageRows(null), []);
    assert.deepEqual(lib.todayUsageRows({ cost: 1.234, tokens: 12_500, sessions: 3 }), [["Custo hoje", "US$ 1.23"], ["Tokens hoje", "13k"], ["Sessões hoje", "3"]]);
    assert.deepEqual(lib.todayUsageRows({ cost: null, tokens: 800, sessions: 1 }), [["Tokens hoje", "800"], ["Sessões hoje", "1"]]);
  });

  test("projectRunningCount: a project that is not open uses the server count", () => {
    assert.equal(lib.projectRunningCount([{ state: "fazendo" }], null, { open: false, serverCount: 3 }), 3, "stale history is ignored when not open");
    assert.equal(lib.projectRunningCount([], null, { open: false }), 0);
    assert.equal(lib.projectRunningCount([], { streaming: true }, { open: false, serverCount: 0 }), 1);
    assert.equal(lib.projectRunningCount([], { streaming: true }, { open: false, serverCount: 2 }), 2);
    assert.equal(lib.projectRunningCount([{ state: "fazendo" }], null, { open: true, serverCount: 5 }), 1, "the open project trusts its own history");
  });
});

describe("navegador (lib)", () => {
  test("fileInfo / viewerKind: by extension (case-insensitive), special names, fonts and unknowns", () => {
    const kinds = {
      "a.png": "image", "A.JPG": "image", "x/y.svg": "image", "doc.pdf": "pdf", "index.html": "html", "p.htm": "html", "README.md": "markdown",
      "a.mp3": "audio", "a.mp4": "video", "src/app.js": "text", "style.css": "text", "data.json": "text", ".gitignore": "text",
      Dockerfile: "text", "C:\\proj\\Makefile": "text", README: "text", "a.tar.gz": "other", noext: "other", "dot.": "other", "f.woff2": "other", "m.wasm": "other",
    };
    for (const [name, kind] of Object.entries(kinds)) assert.equal(lib.viewerKind(name), kind, name);
    assert.equal(lib.fileInfo("a.js").mime, "text/javascript; charset=utf-8");
    assert.equal(lib.fileInfo("a.css").mime, "text/css; charset=utf-8");
    assert.equal(lib.fileInfo("a.json").mime, "application/json; charset=utf-8");
    assert.equal(lib.fileInfo("a.PNG").mime, "image/png");
    assert.equal(lib.fileInfo("a.jpeg").mime, "image/jpeg");
    assert.equal(lib.fileInfo("a.html").mime, "text/html; charset=utf-8");
    assert.equal(lib.fileInfo("a.py").mime, "text/plain; charset=utf-8");
    assert.equal(lib.fileInfo("Dockerfile").mime, "text/plain; charset=utf-8");
    assert.equal(lib.fileInfo("f.woff2").mime, "font/woff2");
    assert.deepEqual(lib.fileInfo("a.zip"), { kind: "other", mime: "application/octet-stream" });
  });

  test("classifyTarget: files (relative, absolute, Windows, ~, file://, :line), never confused with schemes", () => {
    const file = (input) => lib.classifyTarget(input);
    assert.deepEqual(file("src/app.js"), { type: "file", path: "src/app.js", name: "app.js", kind: "text" });
    assert.deepEqual(file("  ./docs/a b.md  "), { type: "file", path: "./docs/a b.md", name: "a b.md", kind: "markdown" });
    assert.deepEqual(file("C:\\Users\\me\\pic.png"), { type: "file", path: "C:/Users/me/pic.png", name: "pic.png", kind: "image" });
    assert.equal(file("c:/x/y.pdf").path, "c:/x/y.pdf");
    assert.equal(file("\\\\srv\\share\\x.txt").path, "//srv/share/x.txt");
    assert.equal(file("~/notes.md").path, "~/notes.md");
    assert.equal(file("src/app.js:42").path, "src/app.js");
    assert.equal(file("src/app.js:42:7").path, "src/app.js");
    assert.equal(file("/etc/hosts").kind, "other");
    assert.equal(file("example.com").type, "file", "no scheme: a file name, never a site");
    assert.equal(file("localhost.txt").type, "file");
    assert.deepEqual(file("file:///C:/Users/me/a%20b.md"), { type: "file", path: "C:/Users/me/a b.md", name: "a b.md", kind: "markdown" });
    assert.equal(file("file:///home/me/x.js").path, "/home/me/x.js");
    assert.deepEqual([file("file://server/share/a.txt"), file("file:///%zz/a"), file("file://[")].map((item) => item.reason), ["remote-file", "bad-url", "bad-url"]);
    assert.equal(lib.classifyTarget(null).reason, "empty");
    assert.equal(file("   ").reason, "empty");
    assert.equal(file("a\u0001b").reason, "control");
  });

  test("classifyTarget: local dev servers, Studio's own port, external pages and refused schemes", () => {
    const local = (input, options) => lib.classifyTarget(input, options);
    assert.deepEqual(local("localhost:3000"), { type: "local", url: "http://localhost:3000/", label: "localhost:3000" });
    assert.deepEqual(local("127.0.0.1:5173/app?x=1"), { type: "local", url: "http://127.0.0.1:5173/app?x=1", label: "127.0.0.1:5173/app" });
    assert.equal(local("http://[::1]:8080/").type, "local");
    assert.equal(local("https://localhost:3443/x").url, "https://localhost:3443/x");
    assert.equal(local("localhost").url, "http://localhost/");
    assert.equal(local("http://LOCALHOST:3000").url, "http://localhost:3000/");
    for (const own of ["http://localhost:4123/x", "127.0.0.1:4123", "http://[::1]:4123", "http://localhost:4123@localhost:4123"]) {
      assert.equal(local(own, { studioPort: 4123 }).type === "local", false, own);
    }
    assert.equal(local("localhost:4123", { studioPort: "4123" }).reason, "studio");
    assert.equal(local("http://localhost.:4123/", { studioPort: 4123 }).reason, "studio", "a trailing dot is the same host");
    assert.equal(local("http://localhost.:3000/").type, "local");
    assert.equal(local("localhost:4124", { studioPort: "4123" }).type, "local");
    assert.equal(local("http://localhost", { studioPort: 80 }).reason, "studio");
    assert.equal(local("https://localhost", { studioPort: 443 }).reason, "studio");
    assert.equal(local("http://localhost", { studioPort: 4123 }).type, "local");
    assert.deepEqual(local("https://example.com/a/b"), { type: "external", url: "https://example.com/a/b", label: "example.com/a/b" });
    assert.deepEqual(local("https://example.com"), { type: "external", url: "https://example.com/", label: "example.com" });
    assert.equal(local("http://127.0.0.2:4123/").type, "external", "only loopback names count as local");
    assert.deepEqual(["javascript:alert(1)", "data:text/html,x", "ftp://x.dev/a", "mailto:a@b.c", "foo:bar", "C:foo"].map((input) => local(input).reason), Array(6).fill("scheme"));
    assert.equal(local("http://").reason, "bad-url");
    assert.equal(local("http://user:pw@localhost:3000/").reason, "credentials");
    assert.equal(local("https://user@example.com/").reason, "credentials");
  });

  test("targetText round-trips through classifyTarget", () => {
    for (const input of ["src/app.js", "C:\\a\\b.png", "localhost:3000/x", "https://example.com/a"]) {
      const target = lib.classifyTarget(input);
      assert.deepEqual(lib.classifyTarget(lib.targetText(target)), target, input);
    }
  });

  test("isOpenablePath: only paths worth a link (known type; bare names only for documents and media)", () => {
    for (const yes of ["src/app.js", "docs/readme.md", "C:\\p\\a.png", "README.md", "pic.png", "page.html", "report.pdf", "clip.mp4", "logs/app.log", "./a/b.css"]) assert.equal(lib.isOpenablePath(yes), true, yes);
    for (const no of ["app.js", "console.log", "a.tar.gz", "dir/file.unknown", "http://localhost:3000", "https://x.dev/a.png", "javascript:void", "", "a b.md", "src/a b.js", "x.y/z"]) assert.equal(lib.isOpenablePath(no), false, no);
  });

  test("renderInline links project paths and keeps everything else as before", () => {
    assert.equal(lib.renderInline("veja `src/app.js` agora"), 'veja <a href="#" class="path-link" data-open="src/app.js"><code>src/app.js</code></a> agora');
    assert.equal(lib.renderInline("`app.js` e `a<b>`"), "<code>app.js</code> e <code>a&lt;b&gt;</code>");
    assert.equal(lib.renderInline("[o plano](docs/plano.md)"), '<a href="#" class="path-link" data-open="docs/plano.md">o plano</a>');
    assert.equal(lib.renderInline('[x](a"b.md)'), '<a href="#" class="path-link" data-open="a&quot;b.md">x</a>');
    assert.equal(lib.renderInline("[x](nada)"), "x");
    assert.equal(lib.renderInline("[x](javascript:void)"), "x");
  });

  test("resolveSibling: links inside a file resolve against its folder", () => {
    assert.equal(lib.resolveSibling("docs/a.md", "b.md"), "docs/b.md");
    assert.equal(lib.resolveSibling("a.md", "b.md"), "b.md");
    assert.equal(lib.resolveSibling("docs/sub/a.md", "../x.md"), "docs/x.md");
    assert.equal(lib.resolveSibling("a.md", "../x.md"), "../x.md");
    assert.equal(lib.resolveSibling("a.md", "../../x.md"), "../../x.md");
    assert.equal(lib.resolveSibling("docs/a.md", "./c//./d.md"), "docs/c/d.md");
    assert.equal(lib.resolveSibling("docs\\a.md", "..\\b.md"), "b.md");
    assert.equal(lib.resolveSibling("/abs/dir/a.md", "b.md"), "/abs/dir/b.md");
    for (const absolute of ["/etc/x", "\\x", "C:\\x", "c:/x", "~/x"]) assert.equal(lib.resolveSibling("docs/a.md", absolute), absolute);
  });

  test("linkAction: plain click opens inline, modifiers open outside, everything else is left alone", () => {
    const file = lib.classifyTarget("a.md");
    const local = lib.classifyTarget("localhost:3000");
    const click = (extra = {}) => ({ button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false, ...extra });
    assert.equal(lib.linkAction(file, click()), "inline");
    assert.equal(lib.linkAction(local, click()), "inline");
    for (const modifier of ["ctrlKey", "metaKey", "shiftKey", "altKey"]) assert.equal(lib.linkAction(file, click({ [modifier]: true })), "outside", modifier);
    assert.equal(lib.linkAction(file, click({ button: 1 })), "ignore");
    assert.equal(lib.linkAction(file, click({ defaultPrevented: true })), "ignore");
    assert.equal(lib.linkAction(lib.classifyTarget("https://example.com"), click()), "ignore");
    assert.equal(lib.linkAction(lib.classifyTarget("javascript:x"), click()), "ignore");
  });

  test("history: push drops the forward part, de-dupes, keeps the newest 20; back/forward stop at the ends", () => {
    let history = lib.emptyBrowserHistory();
    assert.deepEqual(history, { items: [], index: -1 });
    assert.equal(lib.browserHistoryCurrent(history), "");
    assert.equal(lib.browserHistoryMove(history, -1), history);
    assert.equal(lib.browserHistoryMove(history, 1), history);
    history = lib.browserHistoryPush(history, "a");
    assert.equal(lib.browserHistoryPush(history, "a"), history, "same target twice in a row is one entry");
    history = lib.browserHistoryPush(lib.browserHistoryPush(history, "b"), "c");
    assert.deepEqual(history, { items: ["a", "b", "c"], index: 2 });
    assert.equal(lib.browserHistoryMove(history, 1), history, "no forward at the end");
    history = lib.browserHistoryMove(history, -1);
    assert.equal(lib.browserHistoryCurrent(history), "b");
    assert.equal(lib.browserHistoryMove(lib.browserHistoryMove(history, -1), -1).index, 0, "no back before the first");
    history = lib.browserHistoryMove(history, 1);
    assert.equal(lib.browserHistoryCurrent(history), "c");
    history = lib.browserHistoryPush(lib.browserHistoryMove(history, -2), "z");
    assert.deepEqual(history, { items: ["a", "z"], index: 1 });
    let long = lib.emptyBrowserHistory();
    for (let n = 0; n < 25; n++) long = lib.browserHistoryPush(long, `t${n}`);
    assert.equal(long.items.length, 20);
    assert.deepEqual([long.items[0], long.items[19], long.index], ["t5", "t24", 19]);
    assert.equal(lib.browserHistoryPush(lib.emptyBrowserHistory(), "a", 1).items.length, 1);
    assert.deepEqual(lib.browserHistoryPush({ items: ["a"], index: 0 }, "b", 1), { items: ["b"], index: 0 });
  });

  test("parseBrowserHistory: whatever localStorage holds becomes a valid history", () => {
    assert.deepEqual(lib.parseBrowserHistory('{"items":["a","b"],"index":0}'), { items: ["a", "b"], index: 0 });
    assert.deepEqual(lib.parseBrowserHistory('{"items":["a","b"]}'), { items: ["a", "b"], index: 1 });
    assert.deepEqual(lib.parseBrowserHistory('{"items":["a","b"],"index":9}'), { items: ["a", "b"], index: 1 });
    assert.deepEqual(lib.parseBrowserHistory('{"items":["a","b"],"index":-3}'), { items: ["a", "b"], index: 0 });
    assert.deepEqual(lib.parseBrowserHistory('{"items":["a",1,null," ","b"],"index":1.5}'), { items: ["a", "b"], index: 1 });
    const many = JSON.stringify({ items: Array.from({ length: 30 }, (_, n) => `t${n}`), index: 29 });
    assert.deepEqual(lib.parseBrowserHistory(many).items.slice(0, 2), ["t10", "t11"]);
    for (const bad of [null, "", "{oops", "[]", "7", '{"items":"x"}', '{"items":[]}']) assert.deepEqual(lib.parseBrowserHistory(bad), { items: [], index: -1 }, String(bad));
  });

  test("formatBytes", () => {
    assert.deepEqual([0, 1023, 1024, 1536, 1048576, 5.5 * 1048576].map(lib.formatBytes), ["0 B", "1023 B", "1.0 KB", "1.5 KB", "1.0 MB", "5.5 MB"]);
    assert.equal(lib.formatBytes(undefined), "0 B");
  });
});

describe("conversation ⋯ menu", () => {
  const closed = { path: "/s/a.jsonl", sessionId: "abc", state: "pronto" };
  const byId = (entries, id) => entries.find((entry) => entry.id === id);
  const ids = (entries) => entries.map((entry) => entry.id ?? "|");
  const menu = (item, overrides = {}) => lib.sessionMenuItems({ item, isOpen: false, processExited: false, streaming: false, parentKnown: false, ...overrides });
  const real = (entries) => entries.filter((entry) => !entry.separator);

  test("a closed idle conversation offers every action, enabled (they open it first)", () => {
    const entries = menu(closed);
    assert.deepEqual(ids(entries), ["open", "rename", "export", "fork", "clone", "|", "copy-path", "copy-id"]);
    assert.ok(real(entries).every((entry) => entry.disabled === false && entry.sub === undefined));
  });

  test("the open conversation has no Abrir; streaming blocks fork/duplicate but not rename", () => {
    const idle = menu(closed, { isOpen: true });
    assert.equal(byId(idle, "open"), undefined);
    assert.ok(real(idle).every((entry) => !entry.disabled));
    const streaming = menu(closed, { isOpen: true, streaming: true });
    assert.equal(byId(streaming, "rename").disabled, false);
    assert.equal(byId(streaming, "export").disabled, false);
    for (const id of ["fork", "clone"]) assert.deepEqual([byId(streaming, id).disabled, byId(streaming, id).sub], [true, "Aguarde a resposta terminar"]);
    // Streaming of the Studio's PI says nothing about a row that is not open.
    assert.equal(byId(menu(closed, { streaming: true }), "fork").disabled, false);
  });

  test("an exited PI disables what needs it on the open conversation only", () => {
    const open = menu(closed, { isOpen: true, processExited: true });
    for (const id of ["rename", "export", "fork", "clone"]) assert.deepEqual([byId(open, id).disabled, byId(open, id).sub], [true, "PI encerrado"]);
    assert.equal(byId(open, "copy-path").disabled, false);
    assert.equal(byId(menu(closed, { processExited: true }), "clone").disabled, false);
  });

  test("a conversation another PI is writing keeps only the read-only entries", () => {
    for (const state of ["fazendo", "aguardando"]) {
      const entries = menu({ ...closed, state });
      for (const id of ["rename", "fork", "clone"]) assert.deepEqual([byId(entries, id).disabled, byId(entries, id).sub], [true, "Em execução em outro PI"]);
      assert.equal(byId(entries, "export").disabled, false);
      assert.equal(byId(entries, "open").disabled, false);
    }
    // The Studio's own live conversation is "fazendo" too, but it is open here.
    assert.equal(byId(menu({ ...closed, state: "fazendo" }, { isOpen: true }), "rename").disabled, false);
  });

  test("copy entries need a path / an id", () => {
    const entries = menu({ state: "nova" });
    assert.deepEqual([byId(entries, "copy-path").disabled, byId(entries, "copy-path").sub], [true, "Sem arquivo de sessão"]);
    assert.deepEqual([byId(entries, "copy-id").disabled, byId(entries, "copy-id").sub], [true, "Sem ID"]);
  });

  test("sub-PI rows add 'Ir para a conversa pai', disabled when the parent is not loaded", () => {
    const sub = { ...closed, isSubagent: true, parentSession: "/s/parent.jsonl" };
    const known = menu(sub, { parentKnown: true });
    assert.deepEqual(ids(known).slice(-2), ["|", "parent"]);
    assert.equal(byId(known, "parent").disabled, false);
    assert.deepEqual([byId(menu(sub), "parent").disabled, byId(menu(sub), "parent").sub], [true, "Conversa pai não encontrada"]);
    assert.equal(byId(menu({ ...closed, isSubagent: true }, { parentKnown: true }), "parent").disabled, true);
    assert.equal(byId(menu(closed, { parentKnown: true }), "parent"), undefined);
  });
});

describe("Fast mode", () => {
  const astra = { provider: "openai-codex", id: "gpt-6-astra" };
  const sol = { provider: "openai-codex", id: "gpt-6-sol" };

  test("fastFromStatus maps every status string the extension sets", () => {
    const cases = [
      ["⚡🟢", "all", "active"], ["⚡🟡", "all", "pending"], ["🚀🟢", "ultra", "active"], ["🚀🟡", "ultra", "pending"],
      ["⚡ECO", "subagents", "subagents"], ["🚀ECO", "ultra-subagents", "subagents"], ["⚡SUB", "all", "subagents"], ["🚀SUB", "ultra", "subagents"],
    ];
    for (const [text, mode, live] of cases) assert.deepEqual(lib.fastFromStatus(text), { mode, live }, text);
    // Tolerates variation selectors, spaces and case.
    assert.deepEqual(lib.fastFromStatus(" ⚡\uFE0Feco "), { mode: "subagents", live: "subagents" });
    for (const text of [undefined, null, "", "outra coisa", 7]) assert.deepEqual(lib.fastFromStatus(text), { mode: "off", live: "off" });
  });

  test("model eligibility mirrors the extension", () => {
    const codex = (id) => ({ provider: "openai-codex", id });
    for (const id of ["gpt-5.6-sol", "gpt-5.6", "gpt-5.5", "gpt-5.4", "gpt-6-astra", "gpt-6-sol", "gpt-6.1-sol", "gpt-6-luna"]) assert.equal(lib.fastModelEligible(codex(id)), true, id);
    assert.equal(lib.fastModelEligible(codex("gpt-4o")), false);
    assert.equal(lib.fastModelEligible({ provider: "anthropic", id: "gpt-6-astra" }), false);
    assert.equal(lib.fastModelEligible({ provider: "openai-codex" }), false);
    assert.equal(lib.fastModelEligible(undefined), false);
    assert.equal(lib.ultraModelEligible(astra), true);
    assert.equal(lib.ultraModelEligible(sol), false);
    assert.equal(lib.ultraModelEligible({ provider: "x", id: "gpt-6-astra" }), false);
    assert.equal(lib.ultraModelEligible(undefined), false);
  });

  test("fastPanel: segmented options, live state, explanation and chip per mode", () => {
    assert.deepEqual(lib.FAST_OPTIONS.map((option) => option.label), ["Desligado", "Eco", "Fast", "Ultra", "Ultra-eco"]);
    const off = lib.fastPanel({ statusText: undefined, model: astra });
    assert.deepEqual([off.mode, off.liveLabel, off.chip, off.notes], ["off", "desligado", null, []]);
    assert.deepEqual(off.options.filter((option) => option.selected).map((option) => option.flag), ["off"]);
    assert.ok(off.options.every((option) => !option.disabled));
    const expected = {
      "⚡🟢": ["all", "ativo (aceito pelo provedor)", "⚡ Fast"],
      "⚡🟡": ["all", "aguardando confirmação", "⚡ Fast"],
      "⚡ECO": ["subagents", "só subagentes", "⚡ Eco"],
      "🚀🟢": ["ultra", "ativo (aceito pelo provedor)", "🚀 Ultra"],
      "🚀ECO": ["ultra-subagents", "só subagentes", "🚀 Ultra-eco"],
    };
    for (const [status, [mode, label, chip]] of Object.entries(expected)) {
      const panel = lib.fastPanel({ statusText: status, model: astra });
      assert.deepEqual([panel.mode, panel.liveLabel, panel.chip.label], [mode, label, chip], status);
      assert.ok(panel.chip.title.includes(panel.description));
      assert.ok(panel.description.length > 20);
    }
    assert.match(lib.fastPanel({ statusText: "⚡🟢", model: astra }).description, /1,5–2×.*2,5×/);
    assert.match(lib.fastPanel({ statusText: "⚡ECO", model: astra }).description, /só subagentes/);
  });

  test("fastPanel: Ultra needs GPT-6 Astra; a model without Fast gets a note but stays selectable", () => {
    const panel = lib.fastPanel({ statusText: undefined, model: sol });
    const option = (flag) => panel.options.find((candidate) => candidate.flag === flag);
    for (const flag of ["ultra", "ultra-eco"]) assert.deepEqual([option(flag).disabled, option(flag).reason], [true, "Ultra só no GPT-6 Astra"]);
    for (const flag of ["off", "eco", "on"]) assert.equal(option(flag).disabled, false);
    assert.deepEqual(panel.notes, ["Ultra e Ultra-eco só estão disponíveis no GPT-6 Astra."]);
    const claude = lib.fastPanel({ statusText: "⚡SUB", model: { provider: "anthropic", id: "claude" } });
    assert.equal(claude.mode, "all");
    assert.equal(claude.liveLabel, "só subagentes");
    assert.deepEqual(claude.notes, ["Este modelo não tem Fast — vale para subagentes elegíveis.", "Ultra e Ultra-eco só estão disponíveis no GPT-6 Astra."]);
    assert.equal(claude.options.find((candidate) => candidate.flag === "on").disabled, false);
    // A selected option never becomes unselectable; no model known means no restriction.
    assert.equal(lib.fastPanel({ statusText: "🚀ECO", model: sol }).options.find((candidate) => candidate.flag === "ultra-eco").disabled, false);
    assert.ok(lib.fastPanel({ statusText: undefined, model: undefined }).options.every((candidate) => !candidate.disabled));
  });

  test("fastPanel: an optimistic choice overrides the status and reads as pending; no PI disables the rest", () => {
    const pending = lib.fastPanel({ statusText: undefined, model: astra, selected: "all" });
    assert.deepEqual([pending.mode, pending.live, pending.liveLabel, pending.chip.label], ["all", "pending", "aguardando confirmação", "⚡ Fast"]);
    // Choosing what is already reported is not a change.
    assert.equal(lib.fastPanel({ statusText: "⚡🟢", model: astra, selected: "all" }).live, "active");
    const gone = lib.fastPanel({ statusText: "⚡ECO", model: astra, disabledReason: "PI indisponível." });
    assert.deepEqual(gone.notes, ["PI indisponível."]);
    assert.deepEqual(gone.options.map((option) => option.disabled), [true, false, true, true, true]);
    assert.equal(gone.options[1].selected, true);
  });
});

describe("following a conversation owned elsewhere", () => {
  const T0 = Date.parse("2025-03-07T12:00:00Z");
  const ago = (ms) => new Date(T0 - ms).toISOString();
  const row = (title, minutesAgo, extra = {}) => ({ path: `/s/${title}.jsonl`, title, lastActivity: ago(minutesAgo * 60_000), isSubagent: false, state: "pronto", ...extra });

  test("titleMatches: accents, case, whitespace and prefix in either direction; short or empty never match", () => {
    assert.equal(lib.titleMatches("Corrigir a  Configuração do Servidor", "corrigir a configuracao"), true);
    assert.equal(lib.titleMatches("Corrigir", "CORRIGIR a configuração do servidor, depois testar tudo"), true);
    assert.equal(lib.titleMatches("Outra tarefa", "Corrigir a configuração"), false);
    assert.equal(lib.titleMatches("abc", "abcdef"), false, "below the minimum length");
    assert.equal(lib.titleMatches("", "Corrigir"), false);
    assert.equal(lib.titleMatches(undefined, undefined), false);
  });

  test("pickConversation: the Studio's busy PI wins and keeps what is open", () => {
    const history = [row("Alpha tarefa", 1)];
    assert.deepEqual(lib.pickConversation({ history, agents: [{ state: "working", title: "Alpha tarefa" }], liveBusy: true }), { kind: "live", item: null });
  });

  test("pickConversation: the main session titled like the agent beats a more recent one", () => {
    const history = [row("Refatorar o login", 1), row("Corrigir a configuração", 30), row("Corrigir a configuração do CI", 90)];
    const agents = [{ state: "done", title: "corrigir a configuracao" }];
    const pick = lib.pickConversation({ history, agents });
    assert.equal(pick.kind, "agent");
    assert.equal(pick.item.title, "Corrigir a configuração", "among the matches the most recently active one");
  });

  test("pickConversation: a working agent's title is tried before a finished one's", () => {
    const history = [row("Tarefa antiga pronta", 5), row("Tarefa nova rodando", 50)];
    const agents = [{ state: "done", title: "Tarefa antiga pronta" }, { state: "working", title: "Tarefa nova rodando" }, { state: "working", interrupted: true, title: "Tarefa antiga pronta" }];
    assert.equal(lib.pickConversation({ history, agents }).item.title, "Tarefa nova rodando");
  });

  test("pickConversation: sub-PIs are ignored; no match falls back to the latest main session", () => {
    const history = [row("Sub tarefa do agente", 1, { isSubagent: true }), row("Conversa velha", 600), row("Conversa recente", 20), row("Sem data", 0, { lastActivity: "bogus" })];
    const pick = lib.pickConversation({ history, agents: [{ state: "working", title: "Sub tarefa do agente" }, { state: "done", title: "Nada a ver" }] });
    assert.deepEqual([pick.kind, pick.item.title], ["latest", "Conversa recente"]);
    assert.equal(lib.pickConversation({ history }).item.title, "Conversa recente");
  });

  test("pickConversation: nothing to show", () => {
    assert.deepEqual(lib.pickConversation({}), { kind: "none", item: null });
    assert.deepEqual(lib.pickConversation({ history: [row("Só sub-PI aqui", 1, { isSubagent: true })] }), { kind: "none", item: null });
  });

  test("conversationOwner: every ownership condition and the 2-minute edge", () => {
    const quiet = row("Tarefa parada", 10);
    const own = (item, extra = {}) => lib.conversationOwner({ item, now: T0, ...extra });
    assert.deepEqual(own(quiet), { elsewhere: false, why: "" });
    assert.deepEqual(own(null), { elsewhere: false, why: "" });
    // The Studio's own file is never "elsewhere", however fresh.
    assert.deepEqual(own(row("Tarefa parada", 0, { state: "fazendo" }), { studioFile: "/S/Tarefa parada.jsonl" }), { elsewhere: false, why: "" });
    assert.deepEqual(own(row("Tarefa parada", 0), { studioFile: "/other.jsonl" }), { elsewhere: true, why: "recent" });
    // A file one of the Studio's PIs had open (server flag) is not "elsewhere" either: fresh, running or matched by a working agent.
    for (const extra of [{}, { state: "fazendo" }]) assert.deepEqual(own(row("Tarefa parada", 0, { studioOwned: true, ...extra })), { elsewhere: false, why: "" });
    assert.deepEqual(own(row("Tarefa parada", 0, { studioOwned: true }), { agents: [{ state: "working", title: "tarefa parada" }], fallback: true }), { elsewhere: false, why: "" });
    assert.deepEqual(own(row("Tarefa parada", 0, { studioOwned: false })), { elsewhere: true, why: "recent" });
    // A working Orca agent titled like it (not interrupted, not another title).
    assert.deepEqual(own(quiet, { agents: [{ state: "working", title: "tarefa parada" }] }), { elsewhere: true, why: "orca" });
    assert.deepEqual(own(quiet, { agents: [{ state: "working", interrupted: true, title: "tarefa parada" }] }), { elsewhere: false, why: "" });
    assert.deepEqual(own(quiet, { agents: [{ state: "done", title: "tarefa parada" }] }), { elsewhere: false, why: "" });
    assert.deepEqual(own(quiet, { agents: [{ state: "working", title: "Outra coisa qualquer" }] }), { elsewhere: false, why: "" });
    // The fallback pick (no title match possible) is owned by any working agent.
    assert.deepEqual(own(quiet, { agents: [{ state: "working", title: "Outra coisa qualquer" }], fallback: true }), { elsewhere: true, why: "orca" });
    // File state.
    assert.deepEqual(own(row("Tarefa parada", 10, { state: "fazendo" })), { elsewhere: true, why: "state" });
    assert.deepEqual(own(row("Tarefa parada", 10, { state: "aguardando" })), { elsewhere: true, why: "state" });
    for (const state of ["pronto", "parado", "erro", "nova"]) assert.equal(own(row("Tarefa parada", 10, { state })).elsewhere, false, state);
    // Modified under 2 minutes ago is owned; exactly 2 minutes is not.
    assert.deepEqual(own({ ...quiet, lastActivity: ago(119_999) }), { elsewhere: true, why: "recent" });
    assert.deepEqual(own({ ...quiet, lastActivity: ago(120_000) }), { elsewhere: false, why: "" });
    assert.deepEqual(own({ ...quiet, lastActivity: T0 - 1000 }), { elsewhere: true, why: "recent" }, "numeric mtime");
    assert.deepEqual(own({ ...quiet, lastActivity: "bogus" }), { elsewhere: false, why: "" });
    assert.equal(lib.conversationOwner({ item: { ...quiet, lastActivity: new Date().toISOString() } }).why, "recent", "now defaults to the clock");
    assert.equal(lib.OWNED_RECENT_MS, 120_000);
  });

  test("watchStatus: running anywhere keeps the button off, a stopped one turns it on", () => {
    assert.deepEqual(lib.watchStatus({ elsewhere: true, where: "orca" }), { text: "Acompanhando — esta conversa está rodando no terminal do Orca", canContinue: false });
    assert.deepEqual(lib.watchStatus({ elsewhere: true, where: "pi" }), { text: "Acompanhando — esta conversa está rodando em outro PI", canContinue: false });
    assert.equal(lib.watchStatus({ elsewhere: false, where: "orca" }).canContinue, true);
  });

  test("mergeWatchEntries: appends, dedupes by id, resets, caps, returns the same array when nothing is new", () => {
    const a = { id: "a", type: "message" };
    const b = { id: "b", type: "message" };
    const loose = { type: "custom" };
    const current = [a];
    assert.deepEqual(lib.mergeWatchEntries(current, [b, loose]), [a, b, loose]);
    assert.equal(lib.mergeWatchEntries(current, [a]), current, "known ids only: untouched");
    assert.equal(lib.mergeWatchEntries(current, []), current);
    assert.deepEqual(lib.mergeWatchEntries(current, [loose]), [a, loose], "an entry without id is always new");
    assert.deepEqual(lib.mergeWatchEntries(current, [a, b], { reset: true }), [a, b], "reset replaces, even with known ids");
    assert.deepEqual(lib.mergeWatchEntries(current, [], { reset: true }), []);
    assert.deepEqual(lib.mergeWatchEntries([a, b], [{ id: "c" }, { id: "d" }], { max: 3 }).map((entry) => entry.id), ["b", "c", "d"]);
    assert.equal(lib.WATCH_ENTRY_MAX, 5000);
    assert.equal(lib.WATCH_POLL_MS, 1500);
  });

  test("watchMessages: renders the branch that ends at the last entry like get_entries", () => {
    const user = { type: "message", id: "1", parentId: null, message: { role: "user", content: "oi" } };
    const reply = { type: "message", id: "2", parentId: "1", timestamp: "2025-03-07T12:00:05Z", message: { role: "assistant", content: [{ type: "text", text: "olá" }] } };
    const abandoned = { type: "message", id: "3", parentId: "1", message: { role: "assistant", content: "ramo velho" } };
    const header = { type: "session", id: "h" };
    const messages = lib.watchMessages([header, user, abandoned, reply]);
    assert.deepEqual(messages.map((message) => message.role), ["user", "assistant"]);
    assert.equal(lib.messageText(messages[1]), "olá");
    assert.deepEqual(lib.watchMessages([{ type: "custom" }, { type: "message", message: { role: "user", content: "sem id" } }]).map((message) => message.content), ["sem id"], "no ids: everything");
    assert.deepEqual(lib.watchMessages([]), []);
  });
});
