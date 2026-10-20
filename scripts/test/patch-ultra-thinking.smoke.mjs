import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolvePiSdkRoot } from '../../extensions/test/lib/pi-sdk.mjs';

const repo = path.resolve(import.meta.dirname, '../..');
const sourceRoot = resolvePiSdkRoot(import.meta.url);
const main = await import(pathToFileURL(path.join(repo, 'scripts/patch-pi-ultra-thinking.mjs')));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-130-ultra-owned-'));
process.env.HOME = temp;
for (const key of Object.keys(process.env)) {
  if (/API[_-]?KEY|TOKEN|SECRET|AUTH|CREDENTIAL|SESSION|CONFIG_DIR/i.test(key) && key !== 'PATH') delete process.env[key];
}
const piRoot = path.join(temp, 'pi-coding-agent');
const sourceMeta = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8'));
assert.equal(sourceMeta.name, main.PACKAGE_NAME);
assert.equal(sourceMeta.version, main.PACKAGE_VERSION);

function normalizeOwnedCopy(packageRoot) {
  const grouped = new Map();
  for (const [rel, before, after] of main.PATCHES) {
    const operations = grouped.get(rel) ?? [];
    operations.push({ before, after });
    grouped.set(rel, operations);
  }
  const files = [];
  for (const [rel, operations] of grouped) {
    const target = path.join(packageRoot, rel);
    let source = fs.readFileSync(target, 'utf8');
    for (const { before, after } of operations.toReversed()) {
      const beforeCount = source.split(before).length - 1;
      const afterCount = source.split(after).length - 1;
      if (afterCount === 1) {
        source = source.replace(after, before);
        continue;
      }
      if (beforeCount === 1) continue;
      throw new Error(`anchor cardinality mismatch while normalizing owned fixture: ${rel}`);
    }
    files.push({ target, source });
  }
  for (const { target, source } of files) fs.writeFileSync(target, source);
}

try {
  // Drift in a source copy is refused before normalization writes any target.
  const normalizationDriftRoot = path.join(temp, 'normalization-drift-fixture');
  fs.cpSync(sourceRoot, normalizationDriftRoot, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
  const [normalizationDriftRel, pristineAnchor, patchedAnchor] = main.PATCHES[0];
  const driftPath = path.join(normalizationDriftRoot, normalizationDriftRel);
  const driftSource = fs.readFileSync(driftPath, 'utf8');
  const existingAnchor = driftSource.includes(patchedAnchor) ? patchedAnchor : pristineAnchor;
  fs.writeFileSync(driftPath, driftSource.replace(existingAnchor, 'unknown source anchor'));
  const normalizationSnapshot = new Map([...new Set(main.PATCHES.map(([rel]) => rel))].map((rel) => [rel, fs.readFileSync(path.join(normalizationDriftRoot, rel))]));
  assert.throws(() => normalizeOwnedCopy(normalizationDriftRoot), /anchor cardinality mismatch/);
  for (const [rel, bytes] of normalizationSnapshot) assert.deepEqual(fs.readFileSync(path.join(normalizationDriftRoot, rel)), bytes, `${rel}: normalization refusal mutated fixture`);

  // The resolver's SDK is read-only input. Normalize only independent owned copies.
  fs.cpSync(sourceRoot, piRoot, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
  normalizeOwnedCopy(piRoot);
  const sourceArgs = fs.readFileSync(path.join(sourceRoot, 'dist/cli/args.js'));
  assert.equal(await main.patch(piRoot), true);
  assert.equal(await main.patch(piRoot), false, 'patch is not idempotent');
  assert.deepEqual(fs.readFileSync(path.join(sourceRoot, 'dist/cli/args.js')), sourceArgs, 'pristine SDK source was modified');
  assert.equal(main.PULSE_MS, 350);

  const argsPath = path.join(piRoot, 'dist/cli/args.js');
  const cli = await import(pathToFileURL(argsPath));
  assert.equal(cli.isValidThinkingLevel('ultra'), true, 'CLI parser rejects ultra');
  assert.equal(cli.isValidThinkingLevel('unknown'), false, 'CLI parser accepts unknown level');
  let help = '';
  const originalLog = console.log;
  console.log = (...values) => { help += values.join(' '); };
  try { cli.printHelp(); } finally { console.log = originalLog; }
  assert.match(help, /max, ultra/);
  const parse = cli.parseArgs(['--thinking', 'ultra']);
  assert.equal(parse.thinking, 'ultra');

  const modelsPath = path.join(piRoot, 'node_modules/@earendil-works/pi-ai/dist/models.js');
  const modelSchemaPath = path.join(piRoot, 'node_modules/@earendil-works/pi-ai/dist/providers/model-schema.js');
  const coreTypes = fs.readFileSync(path.join(piRoot, 'node_modules/@earendil-works/pi-agent-core/dist/types.d.ts'), 'utf8');
  const aiTypes = fs.readFileSync(path.join(piRoot, 'node_modules/@earendil-works/pi-ai/dist/providers/model-schema.d.ts'), 'utf8');
  assert.match(coreTypes, /"max" \| "ultra"/);
  assert.match(aiTypes, /"max", "ultra"/);
  assert.match(aiTypes, /ModelThinkingLevelSchema: Type\.TEnum<.*"ultra"/);
  assert.match(aiTypes, /ultra: Type\.TOptional<Type\.TUnion/);
  const { getSupportedThinkingLevels } = await import(pathToFileURL(modelsPath));
  const supported = getSupportedThinkingLevels({ reasoning: true, thinkingLevelMap: { ultra: 'ultra' } });
  assert.equal(supported.at(-1), 'ultra', 'runtime supported-level discovery omits ultra');
  assert.deepEqual(getSupportedThinkingLevels({ reasoning: false }), ['off']);

  const read = (rel) => fs.readFileSync(path.join(piRoot, rel), 'utf8');
  assert.match(read('node_modules/@earendil-works/pi-ai/dist/providers/model-schema.js'), /"max", "ultra"/);
  const schemas = await import(pathToFileURL(modelSchemaPath));
  assert.ok(schemas.ModelThinkingLevelSchema.enum.includes('ultra'), 'persisted model thinking setting schema omits ultra');
  assert.ok(schemas.ThinkingLevelMapSchema.properties.ultra, 'model configuration map schema omits ultra');
  assert.match(read('node_modules/@earendil-works/pi-ai/dist/api/openai-codex-responses.d.ts'), /"max" \| "ultra"/);
  assert.match(read('dist/modes/interactive/components/thinking-selector.js'), /ultra: "Ultra reasoning"/);
  assert.match(read('dist/modes/interactive/components/settings-selector.js'), /ultra: "Ultra reasoning"/);
  assert.match(read('dist/modes/interactive/theme/theme-tokens.js'), /thinkingUltraAlt.*fallback: "thinkingUltra"/);
  assert.match(read('dist/modes/interactive/theme/theme.js'), /case "ultra"/);
  const { Theme } = await import(pathToFileURL(path.join(piRoot, 'dist/modes/interactive/theme/theme.js')));
  const { THEME_TOKENS } = await import(pathToFileURL(path.join(piRoot, 'dist/modes/interactive/theme/theme-tokens.js')));
  const palette = Object.fromEntries(Object.keys(THEME_TOKENS).map((token) => [token, '#777777']));
  palette.thinkingMax = '#654321';
  palette.thinkingUltra = '#abcdef';
  palette.thinkingUltraAlt = '#fedcba';
  const theme = new Theme(palette, {}, 'dark');
  assert.match(theme.getThinkingBorderColor('ultra')('pulse'), /pulse/, 'ultra theme border path is not callable');
  const fallbackColors = { ...palette };
  delete fallbackColors.thinkingUltra;
  delete fallbackColors.thinkingUltraAlt;
  const fallbackTheme = new Theme(fallbackColors, {}, 'dark');
  assert.equal(fallbackTheme.getThinkingBorderColor('ultra')('fallback'), fallbackTheme.getThinkingBorderColor('max')('fallback'), 'ultra theme fallback does not preserve max/xhigh colors');
  assert.match(read('dist/modes/interactive/interactive-mode.js'), /ultraPulseTimer/);
  assert.match(read('dist/modes/interactive/theme/dark.json'), /thinkingUltraAlt/);
  assert.match(read('dist/modes/interactive/theme/light.json'), /thinkingUltraAlt/);

  // Preserve the subagent ultra patch regression coverage alongside the SDK upgrade.
  const sub = await import(pathToFileURL(path.join(repo, 'scripts/patch-pi-subagents-ultra-thinking.mjs')));
  const subRoot = path.join(temp, 'subagents');
  fs.mkdirSync(subRoot, { recursive: true });
  fs.writeFileSync(path.join(subRoot, 'package.json'), JSON.stringify({ name: sub.PACKAGE_NAME, version: sub.PACKAGE_VERSION }));
  for (const rel of sub.FILES) {
    const target = path.join(subRoot, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `const levels = ${sub.BEFORE};\n`);
  }
  assert.equal(await sub.patch(subRoot), true);
  assert.equal(await sub.patch(subRoot), false, 'subagent patch is not idempotent');
  for (const rel of sub.FILES) assert.match(fs.readFileSync(path.join(subRoot, rel), 'utf8'), /"max", "ultra"/);

  const changedFiles = [...new Set(main.PATCHES.map(([rel]) => rel))];
  const failureRoot = path.join(temp, 'failure-fixture');
  fs.cpSync(sourceRoot, failureRoot, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
  normalizeOwnedCopy(failureRoot);
  const snapshot = new Map(changedFiles.map((rel) => [rel, fs.readFileSync(path.join(failureRoot, rel))]));
  let failNextRename = true;
  await assert.rejects(main.patch(failureRoot, { renameFile: async (...args) => {
    if (failNextRename) { failNextRename = false; throw new Error('injected commit failure'); }
    return fs.promises.rename(...args);
  } }), /injected commit failure/);
  for (const [rel, bytes] of snapshot) assert.deepEqual(fs.readFileSync(path.join(failureRoot, rel)), bytes, `${rel}: failed commit not rolled back`);

  const driftRel = main.PATCHES[0][0];
  const drift = path.join(piRoot, driftRel);
  fs.writeFileSync(drift, fs.readFileSync(drift, 'utf8').replace(main.PATCHES[0][2], 'unknown source anchor'));
  const beforeRefusal = new Map(changedFiles.map((rel) => [rel, fs.readFileSync(path.join(piRoot, rel))]));
  await assert.rejects(main.patch(piRoot), /anchor cardinality mismatch/);
  for (const [rel, bytes] of beforeRefusal) assert.deepEqual(fs.readFileSync(path.join(piRoot, rel)), bytes, `${rel}: refusal mutated fixture`);

  console.log('patch-ultra-thinking smoke: PASS (owned PI 1.3.0 fixture)');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
