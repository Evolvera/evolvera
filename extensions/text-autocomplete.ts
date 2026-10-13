import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem, AutocompleteProvider, AutocompleteSuggestions } from "@earendil-works/pi-tui";

type BranchMessage = {
	type?: string;
	parentId?: string | null;
	message?: {
		role?: string;
		content?: string | Array<{ type?: string; text?: string }>;
	};
};

const MAX_RECENT_ENTRIES = 60;
const MAX_TEXT_CHARS_PER_MESSAGE = 4_000;
const MAX_WORDS = 600;
const MAX_SUGGESTIONS = 8;
const WORD_RE = /[\p{L}\p{N}_'-]+/gu;
const WORD_PREFIX_RE = /[\p{L}\p{N}_'-]+$/u;

function looksSensitive(word: string): boolean {
	if (/^\d{6,}$/.test(word)) return true;
	if (word.length >= 24 && /^[A-Za-z0-9_+/=-]+$/.test(word)) {
		const digits = (word.match(/\d/g) ?? []).length;
		const hasMixedCase = /[a-z]/.test(word) && /[A-Z]/.test(word);
		if (digits >= 4 && hasMixedCase || word.length >= 28 && hasMixedCase) return true;
	}
	return false;
}

function isPlainWordContext(before: string, token: string, after: string): boolean {
	if (token.length > 32 || !/[\p{L}]/u.test(token) || looksSensitive(token)) return false;
	if (/[\\/@:]/u.test(token) || after && /^[\p{L}\p{N}_'-]/u.test(after)) return false;
	const trimmed = before.trimStart();
	if (trimmed.startsWith("/") || trimmed.startsWith("$") || trimmed.startsWith(">") || trimmed.startsWith("!")) return false;
	if (/(?:https?|ftp):\/\/[^\s]*$/i.test(before)) return false;
	if (/(?:^|\s)@[^\s]*$/u.test(before) || /(?:^|\s)[\w.~/-]*\/[^\s]*$/u.test(before)) return false;
	if (/(?:^|\s)(?:\|\|?|&&?|;|>>?|\$\()\s*[^\s]*$/u.test(before)) return false;
	return true;
}

function collectCurrentBranch(manager: {
	getLeafId(): string | null;
	getEntry(id: string): (BranchMessage & { parentId: string | null }) | undefined;
}): BranchMessage[] {
	const entries: BranchMessage[] = [];
	let id = manager.getLeafId();
	while (id && entries.length < MAX_RECENT_ENTRIES) {
		const entry = manager.getEntry(id);
		if (!entry) break;
		entries.push(entry);
		id = entry.parentId;
	}
	return entries.reverse();
}

function userText(entry: BranchMessage): string | undefined {
	if (entry.type !== "message" || entry.message?.role !== "user") return undefined;
	const content = entry.message.content;
	if (typeof content === "string") return content.slice(-MAX_TEXT_CHARS_PER_MESSAGE);
	if (!Array.isArray(content)) return undefined;
	return content
		.filter((part) => part?.type === "text" && typeof part.text === "string")
		.map((part) => part.text!)
		.join(" ")
		.slice(-MAX_TEXT_CHARS_PER_MESSAGE);
}

function collectWords(entries: BranchMessage[], prefix: string): AutocompleteItem[] {
	const counts = new Map<string, { count: number; exactCase: boolean; variants: Map<string, number> }>();
	for (const entry of entries.slice(-MAX_RECENT_ENTRIES)) {
		const text = userText(entry);
		if (!text) continue;
		for (const match of text.matchAll(WORD_RE)) {
			const word = match[0];
			if (word.length > 32 || !/[\p{L}]/u.test(word) || looksSensitive(word)) continue;
			const key = word.toLocaleLowerCase();
			const prior = counts.get(key);
			if (prior) {
				prior.count += 1;
				prior.exactCase ||= word.startsWith(prefix);
				prior.variants.set(word, (prior.variants.get(word) ?? 0) + 1);
			} else if (counts.size < MAX_WORDS) {
				counts.set(key, { count: 1, exactCase: word.startsWith(prefix), variants: new Map([[word, 1]]) });
			}
		}
	}

	return [...counts.entries()]
		.filter(([key]) => key.startsWith(prefix.toLocaleLowerCase()) && key !== prefix.toLocaleLowerCase())
		.sort(([a, av], [b, bv]) => Number(bv.exactCase) - Number(av.exactCase) || bv.count - av.count || a.length - b.length || a.localeCompare(b))
		.slice(0, MAX_SUGGESTIONS)
		.map(([key, item]) => {
			const value = [...item.variants.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? key;
			return { value, label: value, description: "From this session" };
		});
}

export function createTextAutocompleteProvider(
	current: AutocompleteProvider,
	getBranch: () => BranchMessage[],
): AutocompleteProvider {
	return {
		triggerCharacters: current.triggerCharacters,
		async getSuggestions(lines, cursorLine, cursorCol, options): Promise<AutocompleteSuggestions | null> {
			if (options.signal.aborted) return null;
			const native = await current.getSuggestions(lines, cursorLine, cursorCol, options);
			if (options.signal.aborted) return null;
			if (native?.items?.length) return native;

			const line = lines[cursorLine] ?? "";
			const before = line.slice(0, cursorCol);
			const after = line.slice(cursorCol);
			const match = before.match(WORD_PREFIX_RE);
			if (!match || match[0].length < 3 || !isPlainWordContext(before.slice(0, -match[0].length), match[0], after)) return native;
			const items = collectWords(getBranch(), match[0]);
			if (options.signal.aborted || !items.length) return native;
			return { items, prefix: match[0] };
		},
		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
		},
		shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
			return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
		},
	};
}

export default function (pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui" || !ctx.hasUI) return;
		ctx.ui.addAutocompleteProvider((current) =>
			createTextAutocompleteProvider(current, () => collectCurrentBranch(ctx.sessionManager)),
		);
	});
}
