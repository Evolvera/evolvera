#!/usr/bin/env node
import { chmod, lstat, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = '@earendil-works/pi-coding-agent';
const PACKAGE_VERSION = '0.83.0';
const UNPATCHED_SHA256 = '43588f2f6c8ed226a60a26ce0d9fb9b6e27f142126c5c4eeb1f419c6a9d64b0a';
const PATCHED_SHA256 = '24ff2d926930455caef1b916ae500af74281573f7ff0c25db85bf06f67260ed7';
const PATCHES = [
  ['dist/modes/interactive/components/tool-execution.js', `        if (this.conversationFocus) {
            // Rows that render nothing keep taking no space; there is nothing to disclose.
            const full = this.renderFull(width);
            if (full.length === 0) {
                return [];
            }
            const row = ["", this.renderDisclosureRow(width)];
            return this.revealed ? [...row, ...full] : row;
        }`, `        if (this.conversationFocus) {
            return [];
        }`],
  ['dist/modes/interactive/interactive-mode.js', `                    this.streamingComponent = new AssistantMessageComponent(undefined, this.hideThinkingBlock, this.getMarkdownThemeWithSettings(), this.hiddenThinkingLabel, this.outputPad);`, `                    this.streamingComponent = new AssistantMessageComponent(undefined, this.hideThinkingBlock || this.toolsConversationFocus, this.getMarkdownThemeWithSettings(), this.hiddenThinkingLabel, this.outputPad);`],
  ['dist/modes/interactive/interactive-mode.js', `                const assistantComponent = new AssistantMessageComponent(message, this.hideThinkingBlock, this.getMarkdownThemeWithSettings(), this.hiddenThinkingLabel, this.outputPad);`, `                const assistantComponent = new AssistantMessageComponent(message, this.hideThinkingBlock || this.toolsConversationFocus, this.getMarkdownThemeWithSettings(), this.hiddenThinkingLabel, this.outputPad);`],
  ['dist/modes/interactive/interactive-mode.js', `    toggleToolConversationFocus() {
        this.toolsConversationFocus = !this.toolsConversationFocus;
        const tools = this.getToolExecutionComponents();
        tools.forEach((component, index) => {
            component.setDisclosureIndex(index + 1);
            component.setConversationFocus(this.toolsConversationFocus);
        });
        this.selectedToolExecution = undefined;
        if (this.toolsConversationFocus) {
            this.selectToolExecution(tools.at(-1));
            this.showStatus(\x60Conversation view: tool details hidden (\${keyText("app.tools.selectPrevious")}/\${keyText("app.tools.selectNext")} select, \${keyText("app.tools.reveal")} show/hide)\x60);
        }
        else {
            this.showStatus("Conversation view: off");
        }
    }`, `    toggleToolConversationFocus() {
        this.toolsConversationFocus = !this.toolsConversationFocus;
        this.selectedToolExecution = undefined;
        this.chatContainer.clear();
        this.rebuildChatFromMessages();
        if (this.streamingComponent && this.streamingMessage) {
            this.streamingComponent.setHideThinkingBlock(this.hideThinkingBlock || this.toolsConversationFocus);
            this.streamingComponent.updateContent(this.streamingMessage);
            this.chatContainer.addChild(this.streamingComponent);
        }
        this.showStatus(this.toolsConversationFocus ? "Conversation view: tools and thinking hidden" : "Conversation view: off");
    }`],
  ['dist/modes/interactive/interactive-mode.js', `        if (this.streamingComponent && this.streamingMessage) {
            this.streamingComponent.setHideThinkingBlock(this.hideThinkingBlock);
            this.streamingComponent.updateContent(this.streamingMessage);`, `        if (this.streamingComponent && this.streamingMessage) {
            this.streamingComponent.setHideThinkingBlock(this.hideThinkingBlock || this.toolsConversationFocus);
            this.streamingComponent.updateContent(this.streamingMessage);`],
  ['dist/modes/interactive/interactive-mode.js', `                            child.setHideThinkingBlock(hidden);\n`, `                            child.setHideThinkingBlock(hidden || this.toolsConversationFocus);\n`],
];

function count(source, value) { return source.split(value).length - 1; }
function anchorsDigest(index) { return createHash('sha256').update(PATCHES.map((patch) => patch[index]).join('\0')).digest('hex'); }
function npmRoot() { return execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim(); }
function resolveRoot(argv) {
  if (!argv.length) return path.join(npmRoot(), '@earendil-works', 'pi-coding-agent');
  if (argv.length === 2 && argv[0] === '--package-root' && path.isAbsolute(argv[1])) return argv[1];
  throw new Error('unsupported arguments');
}
async function stage(target, bytes, mode) {
  const dir = await mkdtemp(path.join(path.dirname(target), '.pi-conversation-only-'));
  const file = path.join(dir, path.basename(target));
  await writeFile(file, bytes, { flag: 'wx', mode }); await chmod(file, mode);
  const handle = await open(file, 'r+'); try { await handle.sync(); } finally { await handle.close(); }
  return { dir, file };
}
async function patch(packageRoot, { renameFile = rename } = {}) {
  if (anchorsDigest(1) !== UNPATCHED_SHA256 || anchorsDigest(2) !== PATCHED_SHA256) throw new Error('anchor hash mismatch');
  const meta = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  if (meta.name !== PACKAGE_NAME || meta.version !== PACKAGE_VERSION) throw new Error('package identity mismatch');
  const grouped = new Map();
  for (const [rel, before, after] of PATCHES) { const list = grouped.get(rel) ?? []; list.push({ before, after }); grouped.set(rel, list); }
  const targets = [];
  for (const [rel, operations] of grouped) {
    const target = path.join(packageRoot, rel); const stat = await lstat(target);
    if (!stat.isFile()) throw new Error(`target is not a regular file: ${rel}`);
    const original = await readFile(target); let source = original.toString('utf8'); let changed = false;
    for (const { before, after } of operations) {
      const beforeCount = count(source, before), afterCount = count(source, after);
      if (afterCount > 0 && beforeCount === 0) continue;
      if (beforeCount !== 1) throw new Error(`anchor cardinality mismatch: ${rel}`);
      source = source.replace(before, after); changed = true;
    }
    targets.push({ rel, target, original, output: Buffer.from(source), mode: stat.mode & 0o7777, changed });
  }
  const changed = targets.filter((target) => target.changed); if (!changed.length) return false;
  const staged = [];
  try {
    for (const target of changed) staged.push({ target, next: await stage(target.target, target.output, target.mode), previous: await stage(target.target, target.original, target.mode) });
    const committed = [];
    try {
      for (const item of staged) { committed.push(item); await renameFile(item.next.file, item.target.target); if (!(await readFile(item.target.target)).equals(item.target.output)) throw new Error(`verification failed: ${item.target.rel}`); }
    } catch (error) {
      for (const item of committed.reverse()) await renameFile(item.previous.file, item.target.target);
      throw error;
    }
  } finally { await Promise.all(staged.flatMap((item) => [item.next.dir, item.previous.dir]).map((directory) => rm(directory, { recursive: true, force: true }))); }
  return true;
}
async function main() {
  try { const changed = await patch(resolveRoot(process.argv.slice(2))); console.log(changed ? 'Pi 0.83.0 conversation-only patch applied.' : 'Pi 0.83.0 conversation-only patch already applied.'); }
  catch (error) { console.error(`Pi 0.83.0 conversation-only patch refused: ${error instanceof Error ? error.message : 'unknown error'}`); process.exitCode = 1; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
export { PACKAGE_NAME, PACKAGE_VERSION, PATCHES, UNPATCHED_SHA256, PATCHED_SHA256, anchorsDigest, patch, resolveRoot };
