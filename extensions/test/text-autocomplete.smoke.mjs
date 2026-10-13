import test from "node:test";
import assert from "node:assert/strict";
import extension, { createTextAutocompleteProvider } from "../text-autocomplete.ts";

const signal = () => new AbortController().signal;
const entry = (role, content, type = "message") => ({ type, message: { role, content } });

function fakeBase({ get = async () => null, fileTrigger = false } = {}) {
	return {
		triggerCharacters: ["/", "@"],
		getSuggestions: get,
		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			const line = lines[cursorLine] ?? "";
			const before = line.slice(0, cursorCol - prefix.length);
			const after = line.slice(cursorCol);
			const nextLines = [...lines];
			nextLines[cursorLine] = before + item.value + after;
			return { lines: nextLines, cursorLine, cursorCol: before.length + item.value.length };
		},
		shouldTriggerFileCompletion: () => fileTrigger,
	};
}

async function suggest(provider, text, cursor = text.length, lines = [text]) {
	return provider.getSuggestions(lines, 0, cursor, { signal: signal() });
}

const sampleBranch = [
	entry("user", "hello hello helicopter HELIUM\ncafé cafe"),
	entry("assistant", "hidden helix secret"),
	entry("toolResult", "helipad"),
	entry("user", [{ type: "text", text: "hello help" }, { type: "image", text: "helicopter" }]),
];

function branchReader(entries) {
	const linked = entries.map((item, index) => ({ ...item, id: `entry-${index}`, parentId: index ? `entry-${index - 1}` : null }));
	const byId = new Map(linked.map((item) => [item.id, item]));
	return {
		getLeafId: () => linked.at(-1)?.id ?? null,
		getEntry: (id) => byId.get(id),
	};
}

test("native slash, @file, and path suggestions win unchanged", async () => {
	const nativeResult = { items: [{ value: "native", label: "native" }], prefix: "@fi" };
	for (const input of ["/he", "@fi", "src/he"]) {
		let calls = 0;
		const provider = createTextAutocompleteProvider(fakeBase({ get: async () => { calls++; return nativeResult; } }), () => sampleBranch);
		assert.equal(await suggest(provider, input), nativeResult);
		assert.equal(calls, 1);
	}
});

test("plain suffix completions come only from current branch user text and preserve native editor insertion", async () => {
	const provider = createTextAutocompleteProvider(fakeBase(), () => sampleBranch);
	const result = await suggest(provider, "keep hel, tail", 8);
	assert.equal(result.prefix, "hel");
	assert.ok(result.items.some((item) => item.value === "hello"));
	assert.ok(result.items.every((item) => item.description === "From this session"));
	assert.ok(!result.items.some((item) => ["helix", "helipad"].includes(item.value)));

	const applied = provider.applyCompletion(["keep hel, tail", "other line"], 0, 8, result.items.find((item) => item.value === "hello"), result.prefix);
	assert.deepEqual(applied, { lines: ["keep hello, tail", "other line"], cursorLine: 0, cursorCol: 10 });
});

test("empty branch and unsafe command, path, URL, shell, and credential-like inputs do not complete", async () => {
	const provider = createTextAutocompleteProvider(fakeBase(), () => []);
	assert.equal(await suggest(provider, "hel"), null);
	const branch = [entry("user", "hello helicopter")] ;
	const contextual = createTextAutocompleteProvider(fakeBase(), () => branch);
	for (const input of ["/hel", "@hel", "src/hel", "https://site/hel", "$ hel", "!hel", "echo x | hel"]) {
		assert.equal(await suggest(contextual, input), null, input);
	}
	const credentials = createTextAutocompleteProvider(fakeBase(), () => [entry("user", "Bearer AbCdEfGh1234567890xYz")]);
	assert.equal(await suggest(credentials, "AbCdEfGh1234567890xYz"), null);
	const alphabeticToken = "aAbBcCdDeEfFgGhHiIjJkKlLmMnN";
	const base64Like = createTextAutocompleteProvider(fakeBase(), () => [entry("user", alphabeticToken)]);
	assert.equal(await suggest(base64Like, alphabeticToken), null);
	const numeric = createTextAutocompleteProvider(fakeBase(), () => [entry("user", "1234567890123456")]);
	assert.equal(await suggest(numeric, "1234567890123456"), null);
});

test("Unicode prefixes, multiline text, prefix case, ranking, and suggestion limits", async () => {
	const branch = [entry("user", "café Caseword Caseword\ncaseword canopy catapult catalyst catalog\nprocess progress program proactive promise property profile project product")];
	const provider = createTextAutocompleteProvider(fakeBase(), () => branch);
	const unicode = await suggest(provider, "caf");
	assert.ok(unicode.items.some((item) => item.value === "café"));
	const ranked = await suggest(provider, "Cas");
	assert.equal(ranked.items[0].value, "Caseword");
	const limited = await suggest(provider, "pro");
	assert.equal(limited.items.length, 8);
});

test("abort is checked before and after native delegation; metadata and file-trigger hook are preserved", async () => {
	const aborted = new AbortController();
	aborted.abort();
	let called = false;
	const base = fakeBase({ get: async () => { called = true; return null; }, fileTrigger: false });
	const provider = createTextAutocompleteProvider(base, () => sampleBranch);
	assert.equal(await provider.getSuggestions(["hel"], 0, 3, { signal: aborted.signal }), null);
	assert.equal(called, false);
	assert.equal(provider.triggerCharacters, base.triggerCharacters);
	assert.equal(provider.shouldTriggerFileCompletion([], 0, 0), false);

	let complete;
	const delayed = createTextAutocompleteProvider(fakeBase({ get: () => new Promise((resolve) => { complete = resolve; }) }), () => sampleBranch);
	const controller = new AbortController();
	const pending = delayed.getSuggestions(["hel"], 0, 3, { signal: controller.signal });
	controller.abort();
	complete(null);
	assert.equal(await pending, null);
});

test("extension installs only in native TUI sessions and starts no other work", async () => {
	let handler;
	const registrations = [];
	const pi = { on: (event, callback) => { assert.equal(event, "session_start"); handler = callback; } };
	extension(pi);
	const context = (mode, hasUI) => ({
		mode,
		hasUI,
		ui: { addAutocompleteProvider: (factory) => registrations.push(factory) },
		sessionManager: branchReader(sampleBranch),
	});
	await handler({}, context("rpc", true));
	await handler({}, context("tui", false));
	assert.equal(registrations.length, 0);
	await handler({}, context("tui", true));
	assert.equal(registrations.length, 1);
	const base = fakeBase();
	const provider = registrations[0](base);
	assert.ok((await suggest(provider, "hel")).items.length > 0);
});
