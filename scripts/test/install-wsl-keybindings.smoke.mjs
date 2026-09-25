import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { trySymlinkFile } from '../../extensions/test/lib/test-symlink.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const helper = path.join(root, 'scripts/install-wsl-keybindings.sh');
const source = path.join(root, 'config/keybindings.json');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'evolvera-wsl-keybindings-'));

function run(destination, env = {}) {
  const childEnv = { ...process.env, ...env };
  for (const name of ['WSL_DISTRO_NAME', 'WSL_INTEROP']) {
    if (!(name in env)) delete childEnv[name];
  }
  const result = spawnSync('bash', [helper, source, destination], {
    cwd: root,
    encoding: 'utf8',
    env: childEnv,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

try {
  const fresh = path.join(temp, 'fresh.json');
  assert.equal(run(fresh, { WSL_DISTRO_NAME: 'Synthetic' }), 'installed');
  assert.equal(fs.readFileSync(fresh, 'utf8'), fs.readFileSync(source, 'utf8'));

  const custom = path.join(temp, 'custom.json');
  const customContent = '{"custom":true}\n';
  fs.writeFileSync(custom, customContent);
  assert.equal(run(custom, { WSL_INTEROP: '/synthetic/interop' }), 'preserved');
  assert.equal(fs.readFileSync(custom, 'utf8'), customContent);

  const dangling = path.join(temp, 'dangling.json');
  const missingTarget = path.join(temp, 'not-created.json');
  if (trySymlinkFile(missingTarget, dangling, 'dangling keybindings symlink')) {
    assert.equal(run(dangling, { WSL_DISTRO_NAME: 'Synthetic' }), 'preserved');
    assert.equal(fs.readlinkSync(dangling), missingTarget);
    assert.equal(!fs.existsSync(missingTarget), true);
  }

  const osRelease = fs.existsSync('/proc/sys/kernel/osrelease')
    ? fs.readFileSync('/proc/sys/kernel/osrelease', 'utf8')
    : '';
  const hostIsWsl = Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP)
    || /microsoft|wsl/i.test(osRelease);
  if (hostIsWsl) {
    console.log('non-WSL host-negative case skipped (WSL host)');
  } else {
    const nonWslParent = path.join(temp, 'non-wsl-missing-parent');
    const nonWsl = path.join(nonWslParent, 'keybindings.json');
    assert.equal(run(nonWsl), 'skipped');
    assert.equal(fs.existsSync(nonWslParent), false);
  }

  const install = fs.readFileSync(path.join(root, 'install.sh'), 'utf8');
  assert.match(install, /install-wsl-keybindings\.sh/);
  assert.doesNotMatch(install, /cp\s+"\$SCRIPT_DIR\/config\/keybindings\.json"\s+"\$PI_DIR\/keybindings\.json"/);

  const keybindings = JSON.parse(fs.readFileSync(source, 'utf8'));
  assert.deepEqual(keybindings['app.clipboard.pasteImage'], ['ctrl+v', 'alt+v']);
  console.log('install-wsl-keybindings smoke: PASS');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
