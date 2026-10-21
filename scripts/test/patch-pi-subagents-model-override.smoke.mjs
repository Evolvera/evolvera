import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolvePiSdkRoot } from '../../extensions/test/lib/pi-sdk.mjs';

const repo = path.resolve(import.meta.dirname, '../..');
const patcher = await import(pathToFileURL(path.join(repo, 'scripts/patch-pi-subagents-model-override.mjs')));
const installed = patcher.resolveRoot([]);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evolvera-model-override-'));
const cp = (from, to) => fs.cpSync(from, to, { recursive: true });
const copy = path.join(temp, 'package');
try {
  const meta = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8'));
  assert.equal(meta.version, '0.18.2');
  cp(installed, copy);
  // Resolve SDK/jiti before any environment redirection and provide only this source module's runtime dependency.
  const sdk = resolvePiSdkRoot(import.meta.url);
  fs.mkdirSync(path.join(copy, 'node_modules/@sinclair'), { recursive: true });
  fs.cpSync(path.join(path.dirname(installed), '..', '@sinclair', 'typebox'), path.join(copy, 'node_modules/@sinclair/typebox'), { recursive: true });
  // What: before the patch an explicit model is ignored when frontmatter has one.
  // Expected: reproduce the documented incident, so patch behavior has a meaningful regression oracle.
  // Why: prove the smoke is testing the observed bug, not merely patch text.
  const { createJiti } = await import(pathToFileURL(path.join(sdk, 'node_modules/jiti/lib/jiti.mjs')).href);
  const jiti = createJiti(import.meta.url, { fsCache: false });
  const configPath = path.join(copy, 'src/invocation-config.ts');
  const config = await jiti.import(configPath);
  const before = config.resolveAgentInvocationConfig({ model: 'frontmatter-model', thinking: 'low' }, { model: 'caller-model', thinking: 'high' });
  assert.equal(before.modelInput, 'frontmatter-model', 'unpatched package demonstrates frontmatter currently wins');
  assert.deepEqual(before.overridden, { thinking: 'high', model: 'caller-model' }, 'unpatched package marks requested values as overridden');

  // What: apply and reapply to a package copy.
  // Expected: first invocation changes files, second reports an idempotent no-op.
  // Why: installer reruns must not mutate an already patched package.
  assert.equal(await patcher.patch(copy), true);
  const changedFiles = new Set(patcher.PATCHES.map(([rel]) => rel));
  const bytes = new Map([...changedFiles].map(rel => [rel, fs.readFileSync(path.join(copy, rel))]));
  assert.equal(await patcher.patch(copy), false);
  for (const [rel, data] of bytes) assert.deepEqual(fs.readFileSync(path.join(copy, rel)), data);

  const patchedSource = path.join(temp, 'patched-src');
  fs.cpSync(path.join(copy, 'src'), patchedSource, { recursive: true });
  fs.cpSync(path.join(copy, 'node_modules'), path.join(temp, 'node_modules'), { recursive: true });
  const patchedJiti = createJiti(import.meta.url, { fsCache: false });
  const resolved = await patchedJiti.import(path.join(patchedSource, 'invocation-config.ts'));
  // What: caller supplies a model and thinking level contrary to frontmatter.
  // Expected: caller's explicit values win and modelFromParams is true.
  // Why: those values are requests, while frontmatter is only a default.
  const override = resolved.resolveAgentInvocationConfig({ model: 'frontmatter-model', thinking: 'low' }, { model: 'caller-model', thinking: 'high' });
  assert.equal(override.modelInput, 'caller-model');
  assert.equal(override.modelFromParams, true);
  assert.equal(override.thinking, 'high');
  assert.equal(override.overridden, undefined, 'accepted caller values are not misreported as overridden');

  // What: omit invocation overrides.
  // Expected: configured frontmatter model/thinking remain defaults.
  // Why: the precedence change must not disturb normal agent-type defaults.
  const defaults = resolved.resolveAgentInvocationConfig({ model: 'frontmatter-model', thinking: 'low' }, {});
  assert.equal(defaults.modelInput, 'frontmatter-model');
  assert.equal(defaults.modelFromParams, false);
  assert.equal(defaults.thinking, 'low');

  const index = fs.readFileSync(path.join(copy, 'src/index.ts'), 'utf8');
  const modelStart = index.indexOf('let model = ctx.model;');
  const modelEnd = index.indexOf('// Scope validation', modelStart);
  assert.ok(modelStart >= 0 && modelEnd > modelStart, 'index model-resolution branch is present');
  const runModelBranch = new Function('ctx', 'resolvedConfig', 'resolveModel', 'customConfig', 'textResult', `${index.slice(modelStart, modelEnd)} return model;`);
  const parentModel = { provider: 'parent', id: 'parent-model' };

  // What: inherit frontmatter with no caller model.
  // Expected: no model input is resolved, so the index branch retains the parent model.
  // Why: "inherit" is a deliberate directive, not an invalid provider model.
  const inheritConfig = resolved.resolveAgentInvocationConfig({ model: ' InHeRiT ' }, {});
  assert.equal(inheritConfig.modelInput, undefined);
  assert.equal(inheritConfig.modelFromParams, false);
  assert.equal(runModelBranch({ model: parentModel }, inheritConfig, () => assert.fail('inherit must not resolve'), {}, text => text), parentModel);

  // What: inherit frontmatter plus explicit caller model.
  // Expected: caller model is resolved and used instead of parent.
  // Why: inherit only supplies a default when no explicit request exists.
  const inheritOverride = resolved.resolveAgentInvocationConfig({ model: 'inherit' }, { model: 'requested-model' });
  const callerModel = { provider: 'caller', id: 'requested-model' };
  assert.equal(inheritOverride.modelInput, 'requested-model');
  assert.equal(runModelBranch({ model: parentModel }, inheritOverride, name => name === 'requested-model' ? callerModel : 'unexpected error', {}, text => text), callerModel);

  // What: requested model cannot resolve; check the index failure branch's explicit message.
  // Expected: the resolver error is surfaced with agent type default included, never fallback silently.
  // Why: callers must know that their requested model prevented agent startup.
  assert.match(index, /return textResult\(resolved \+ "\\n\\nAgent type default model: " \+ \(customConfig\?\.model \?\? "none"\)\);/);
  assert.match(index, /modelInput: resolvedConfig\.modelInput/);
  const resolverModule = await patchedJiti.import(path.join(patchedSource, 'model-resolver.ts'));
  const failure = resolverModule.resolveModel('missing-requested-model', { getAvailable: () => [], getAll: () => [], find: () => undefined });
  assert.match(failure, /^Model not found:/);
  // Exercise the exact failure branch extracted from index.ts with a synthetic resolver error.
  const errorBranch = index.match(/return textResult\(resolved \+ "\\n\\nAgent type default model: " \+ \(customConfig\?\.model \?\? "none"\)\);/)?.[0];
  assert.ok(errorBranch, 'index.ts model-resolution error branch exists');
  const executeErrorBranch = new Function('resolved', 'customConfig', 'textResult', `${errorBranch}; return undefined;`);
  const errorResult = executeErrorBranch(failure, { model: 'frontmatter-default' }, (text) => text);
  assert.equal(errorResult, `${failure}\n\nAgent type default model: frontmatter-default`);

  // What: apply the installer patches in order to an isolated copy.
  // Expected: all pre-existing patches remain compatible and model override applies afterward.
  // Why: the new index.ts anchors must compose with the installer sequence.
  const composed = path.join(temp, 'composed'); cp(installed, composed);
  const patchNames = ['ultra-thinking', 'deferred-nudges', 'bounded-waits', 'model-override', 'hud'];
  for (const name of patchNames) {
    const module = await import(pathToFileURL(path.join(repo, `scripts/patch-pi-subagents-${name}.mjs`)));
    await module.patch(composed);
  }
  console.log('patch-pi-subagents-model-override smoke: PASS');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
