#!/usr/bin/env node
// Contract probe: default discovery/coverage and fixed suites, without real smokes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [candidate, inventoryFile, ownedTemp] = process.argv.slice(2);
assert(candidate && inventoryFile && ownedTemp, 'candidate, inventory JSON, owned temp required');
const inventory = JSON.parse(fs.readFileSync(inventoryFile, 'utf8'));
const root = fs.mkdtempSync(path.join(fs.realpathSync(ownedTemp), 'default-fixture-'));
const sentinel = path.join(root, 'executed.jsonl');
const runner = path.join(root, 'scripts/run-tests.mjs');
fs.mkdirSync(path.dirname(runner), { recursive: true });
fs.copyFileSync(candidate, runner);
const record = id => `import fs from 'node:fs'; fs.appendFileSync(${JSON.stringify(sentinel)}, ${JSON.stringify(JSON.stringify(id) + '\n')});\n`;
for (const rel of inventory) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, record(rel));
}
const added = 'scripts/test/run-tests.smoke.mjs';
if (!inventory.includes(added)) fs.writeFileSync(path.join(root, added), record(added));
const unknown = 'scripts/test/unknown-new-contract.smoke.mjs';
fs.writeFileSync(path.join(root, unknown), record(unknown));
const ct = 'skills/copy-thief/scripts/test/ct.test.mjs';
fs.mkdirSync(path.dirname(path.join(root, ct)), { recursive: true });
fs.writeFileSync(path.join(root, ct), record(ct));
fs.mkdirSync(path.join(root, 'interface'), { recursive: true });
fs.writeFileSync(path.join(root, 'interface/package.json'), JSON.stringify({ scripts: { test: 'node probe.cjs' } }));
fs.writeFileSync(path.join(root, 'interface/probe.cjs'), `require('fs').appendFileSync(${JSON.stringify(sentinel)}, '"UNSAFE_INTERFACE"\\n');\n`);
const home = path.join(root, 'home');
const temp = path.join(root, 'tmp');
fs.mkdirSync(home); fs.mkdirSync(temp);
const started = performance.now();
const result = spawnSync(process.execPath, [runner], {
  cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 2 ** 20,
  env: { PATH: process.env.PATH, HOME: home, TMPDIR: temp, TMP: temp, TEMP: temp },
});
const executed = fs.existsSync(sentinel) ? fs.readFileSync(sentinel, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
const forbidden = inventory.filter(x => path.basename(x) === 'patch-openai-error-body.smoke.mjs');
const expected = [...inventory.filter(x => !forbidden.includes(x)), ...(!inventory.includes(added) ? [added] : []), ct];
const missing = expected.filter(x => !executed.includes(x));
const unexpected = executed.filter(x => !expected.includes(x));
const pass = result.status === 0 && missing.length === 0 && unexpected.length === 0 && executed.length === expected.length;
const receipt = { test: 'default-root synthetic contract', pass, root, exitCode: result.status, signal: result.signal, wallSeconds: (performance.now() - started) / 1000,
  expectedExecutions: expected.length, executed: executed.length, missing, unexpected,
  resourceProof: 'DISPOSABLE_VERIFIED: every discovered smoke, fixed ct and interface are synthetic files in this newly created root; no original smoke or service executed; no cleanup',
  stdout: result.stdout || '', stderr: result.stderr || '' };
console.log(JSON.stringify(receipt, null, 2));
process.exitCode = pass ? 0 : 1;
