// "Dúvidas" tab: the pure decisions in public/lib.js (event reducer, conversation path, status text, tab and shortcut).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as lib from "../public/lib.js";

const ended = (role, content, extra = {}) => ({ type: "message_end", message: { role, content, ...extra } });
const apply = (chat, ...payloads) => payloads.reduce((state, payload) => lib.sideChatApply(state, payload), chat);

describe("side chat: conversation and text", () => {
  // What: which conversation the side chat belongs to. Expected: the followed (watch) file, else the Studio PI's file, else null. Why: switching conversation must switch the chat.
  test("sideChatPath prefers the followed conversation, then the open one, else null", () => {
    assert.equal(lib.sideChatPath({ watch: { path: "/a.jsonl" }, session: { sessionFile: "/b.jsonl" } }), "/a.jsonl");
    assert.equal(lib.sideChatPath({ watch: null, session: { sessionFile: "/b.jsonl" } }), "/b.jsonl");
    assert.equal(lib.sideChatPath({ session: { sessionFile: "" } }), null);
    assert.equal(lib.sideChatPath({ session: {} }), null);
    assert.equal(lib.sideChatPath({ session: { sessionFile: 5 } }), null);
    assert.equal(lib.sideChatPath(), null);
  });

  // What: message content shapes. Expected: plain strings and text parts joined; thinking/tool parts ignored. Why: only what was said is shown.
  test("sideChatText reads strings and text parts only", () => {
    assert.equal(lib.sideChatText("oi"), "oi");
    assert.equal(lib.sideChatText([{ type: "thinking", thinking: "x" }, { type: "text", text: "a" }, { type: "toolCall" }, { type: "text", text: "b" }, null, { type: "text", text: 4 }]), "a\nb");
    assert.equal(lib.sideChatText(undefined), "");
    assert.equal(lib.sideChatText({}), "");
  });

  // What: footer text. Expected: busy, ended, or empty. Why: the user must know why nothing moves and what the next question does.
  test("sideChatStatusText explains answering and ended sessions", () => {
    assert.match(lib.sideChatStatusText({ ...lib.sideChatInitial(), busy: true }), /Consultando/);
    assert.match(lib.sideChatStatusText({ ...lib.sideChatInitial(), ended: true }), /encerrada.*nova/);
    assert.equal(lib.sideChatStatusText(lib.sideChatInitial()), "");
  });
});

describe("side chat: sideChatAsk / sideChatFail", () => {
  // What: asking shows the question at once. Expected: trimmed unconfirmed user item, busy; blank text ignored. Why: instant feedback, nothing sent for nothing.
  test("sideChatAsk adds an unconfirmed user item and marks busy; blank text changes nothing", () => {
    const chat = lib.sideChatAsk(lib.sideChatInitial(), "  o que houve?  ");
    assert.deepEqual(chat.items, [{ role: "user", text: "o que houve?", confirmed: false }]);
    assert.equal(chat.busy, true);
    const same = lib.sideChatInitial();
    assert.equal(lib.sideChatAsk(same, "   "), same);
    assert.equal(lib.sideChatAsk(same, undefined), same);
  });

  // What: a failed request. Expected: error item, not busy, live text dropped. Why: the user sees what went wrong and can retry.
  test("sideChatFail shows the error and stops waiting", () => {
    const chat = lib.sideChatFail({ ...lib.sideChatAsk(lib.sideChatInitial(), "x"), live: "meio" }, "HTTP 500");
    assert.deepEqual(chat.items.at(-1), { role: "error", text: "HTTP 500" });
    assert.equal(chat.busy, false);
    assert.equal(chat.live, "");
    assert.equal(lib.sideChatFail(lib.sideChatInitial(), "").items[0].text, "Não foi possível consultar agora.");
  });
});

describe("side chat: sideChatApply (RPC events)", () => {
  // What: a full exchange as the PI streams it. Expected: question confirmed (not duplicated), streamed text then the final answer, not busy at the end. Why: the core chat loop.
  test("a question and its streamed answer end as two items", () => {
    let chat = lib.sideChatAsk(lib.sideChatInitial(), "e agora?");
    chat = apply(chat, { type: "agent_start" }, ended("user", "e agora?"));
    assert.equal(chat.items.length, 1);
    assert.equal(chat.items[0].confirmed, true);
    chat = apply(chat, { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Estão " } }, { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "testando." } });
    assert.equal(chat.live, "Estão testando.");
    chat = apply(chat, ended("assistant", [{ type: "text", text: "Estão testando." }], { stopReason: "stop" }), { type: "agent_end" });
    assert.deepEqual(chat.items.map((item) => [item.role, item.text]), [["user", "e agora?"], ["assistant", "Estão testando."]]);
    assert.equal(chat.live, "");
    assert.equal(chat.busy, false);
  });

  // What: history replayed after a reconnect (nothing asked locally). Expected: user items come from the events. Why: the chat rebuilds from the server history.
  test("user messages that were not asked locally are added from the event", () => {
    const chat = apply(lib.sideChatInitial(), ended("user", [{ type: "text", text: "do replay" }]), ended("user", [{ type: "image" }]));
    assert.deepEqual(chat.items, [{ role: "user", text: "do replay", confirmed: true }]);
    // Two identical queued questions are confirmed one at a time.
    const twice = apply(lib.sideChatAsk(lib.sideChatAsk(lib.sideChatInitial(), "igual"), "igual"), ended("user", "igual"));
    assert.deepEqual(twice.items.map((item) => item.confirmed), [true, false]);
  });

  // What: assistant turns without text or ending in error. Expected: tool-only turn adds nothing; an errored turn shows its message. Why: no empty bubbles, no silent failures.
  test("assistant messages: tool-only turns are skipped and errors are shown", () => {
    const toolOnly = apply({ ...lib.sideChatInitial(), live: "x" }, ended("assistant", [{ type: "toolCall", name: "read" }]));
    assert.deepEqual(toolOnly.items, []);
    assert.equal(toolOnly.live, "");
    const failed = apply(lib.sideChatInitial(), ended("assistant", [], { stopReason: "error", errorMessage: "529 overloaded" }));
    assert.deepEqual(failed.items, [{ role: "error", text: "529 overloaded" }]);
    const noText = apply(lib.sideChatInitial(), ended("assistant", [], { stopReason: "error" }));
    assert.equal(noText.items[0].text, "O assistente não conseguiu responder.");
    assert.deepEqual(apply(lib.sideChatInitial(), ended("toolResult", [{ type: "text", text: "x" }])).items, []);
  });

  // What: process end and noise. Expected: exit marks ended and stops waiting; unrelated/malformed events change nothing. Why: the next question must reopen the chat.
  test("process_exit ends the chat; other payloads leave the state untouched", () => {
    const busy = { ...lib.sideChatInitial(), busy: true, live: "x" };
    assert.deepEqual(apply(busy, { type: "process_exit", code: 0 }), { items: [], live: "", busy: false, ended: true });
    assert.deepEqual(apply(busy, { type: "process_error", message: "x" }), { items: [], live: "", busy: false, ended: true });
    for (const noise of [null, "x", { type: "turn_start" }, { type: "message_update", assistantMessageEvent: { type: "thinking_delta", delta: "z" } }, { type: "message_update" }, { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: 3 } }, { type: "message_end" }]) {
      assert.deepEqual(apply(busy, noise), busy, JSON.stringify(noise));
    }
  });

  // What: a very long chat. Expected: only the newest 200 items stay. Why: bounded memory in the browser.
  test("the item list is bounded to the newest entries", () => {
    let chat = lib.sideChatInitial();
    for (let index = 0; index < lib.SIDE_CHAT_MAX_ITEMS + 5; index += 1) chat = apply(chat, ended("assistant", [{ type: "text", text: `r${index}` }]));
    assert.equal(chat.items.length, lib.SIDE_CHAT_MAX_ITEMS);
    assert.equal(chat.items.at(-1).text, `r${lib.SIDE_CHAT_MAX_ITEMS + 4}`);
    assert.equal(chat.items[0].text, "r5");
  });
});

describe("side chat: tab and shortcut", () => {
  // What: the new tab. Expected: last visible inspector tab "sidechat", valid even with Orca off. Why: persisted choice and keyboard roving must accept it.
  test("sidechat is a persistent inspector tab and Alt+D opens it", () => {
    assert.equal(lib.INSPECTOR_TABS.at(-1), "sidechat");
    assert.equal(lib.resolveInspectorTab("sidechat", lib.DEFAULT_SETTINGS), "sidechat");
    assert.equal(lib.shortcutAction({ key: "d", code: "KeyD", altKey: true }, { typing: true }), "doubts");
    assert.equal(lib.shortcutAction({ key: "D", altKey: true }), "doubts");
    assert.equal(lib.shortcutAction({ key: "∂", code: "KeyD", altKey: true }), "doubts");
    assert.equal(lib.shortcutAction({ key: "d", altKey: true, ctrlKey: true }), null);
    assert.equal(lib.shortcutAction({ key: "d" }), null);
    const listed = lib.SHORTCUT_GROUPS.flatMap((group) => group.items).find((item) => item.keys.join("+") === "Alt+D");
    assert.match(listed.label, /Dúvidas/);
  });
});
