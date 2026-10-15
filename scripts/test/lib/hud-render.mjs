// Shared fixtures for the HUD patch smokes: theme doubles, palette rules and disposable package copies.
// Nothing here touches the installed packages except to read them.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolvePiSdkRoot } from '../../../extensions/test/lib/pi-sdk.mjs';

// Palette contract: red, orange, white and gray, via these theme tokens only.
export const ALLOWED_TOKENS = new Set(['accent', 'thinkingXhigh', 'thinkingHigh', 'error', 'warning', 'thinkingMedium', 'thinkingLow', 'text', 'muted', 'dim', 'borderMuted']);
// Blue, green, purple and pink tokens, plus anything not in the allow-list, must never be requested.
export const FORBIDDEN_TOKENS = ['borderAccent', 'success', 'customMessageLabel', 'mdLink', 'thinkingMax'];

/** Theme that prints token names, e.g. `[warning]◢[/]`, and records every token it was asked for. */
export function tokenTheme() {
  const used = new Set();
  return {
    used,
    fg: (token, text) => { used.add(token); return `[${token}]${text}[/]`; },
    bold: (text) => `<b>${text}</b>`,
    strikethrough: (text) => `<s>${text}</s>`,
  };
}

/** Theme with no styling, so string width equals visible width. */
export const plainTheme = { fg: (_token, text) => text, bold: (text) => text, strikethrough: (text) => text };

/** Remove the markup produced by tokenTheme. */
export const stripTokens = (line) => line.replace(/\[\/\]|\[[A-Za-z]+\]|<\/?[bs]>/g, '');

export async function loadRealTheme(root) {
  // chalk (used for bold/strikethrough) reads the colour level at import time.
  process.env.FORCE_COLOR = '3';
  const themeModule = await import(pathToFileURL(path.join(resolvePiSdkRoot(import.meta.url), 'dist/modes/interactive/theme/theme.js')).href);
  return themeModule.loadThemeFromPath(path.join(root, 'themes/cyberpsycho.json'), 'truecolor');
}

export function createJitiFor(importMetaUrl, alias) {
  const require = createRequire(importMetaUrl);
  const { createJiti } = require(path.join(resolvePiSdkRoot(importMetaUrl), 'node_modules/jiti/lib/jiti.cjs'));
  return createJiti(importMetaUrl, { fsCache: false, alias });
}

/** Copy a package directory (without nested node_modules) into a disposable location. */
export function copyPackage(from, to) {
  fs.cpSync(from, to, { recursive: true, filter: (source) => path.basename(source) !== 'node_modules' });
}

/** Undo a patch in a copy so the test always starts from upstream bytes, even once the installed copy is patched. */
export function toUpstream(packageRoot, patches, extra = (source) => source) {
  for (const rel of new Set(patches.map(([r]) => r))) {
    const file = path.join(packageRoot, rel);
    let source = fs.readFileSync(file, 'utf8');
    // An `after` can be a substring of pristine text, so undo only where `before` is gone — unless the
    // `after` itself wraps `before` (an insertion such as a helpers block), which is undone whenever present.
    for (const [r, before, after] of [...patches].reverse()) {
      if (r !== rel || !source.includes(after)) continue;
      if (after.includes(before) || !source.includes(before)) source = source.replace(after, () => before);
    }
    fs.writeFileSync(file, extra(source, rel));
  }
}

export function assertPaletteAndShape(lines, { width, visibleWidth, label }) {
  for (const line of lines) {
    assert.ok(visibleWidth(line) <= width, `${label}: line wider than ${width}: ${JSON.stringify(line)}`);
    assert.ok(!/[├└│]/u.test(line) && !line.includes('⎿') && !line.includes('⛓'), `${label}: legacy connector in ${JSON.stringify(line)}`);
  }
}

export function assertTokens(used, label) {
  for (const token of used) {
    assert.ok(ALLOWED_TOKENS.has(token), `${label}: token outside the palette: ${token}`);
    assert.ok(!FORBIDDEN_TOKENS.includes(token), `${label}: forbidden token: ${token}`);
  }
}
