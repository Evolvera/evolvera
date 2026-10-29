import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { installPayload, installPayloadCommand } from '../desktop/install-payload.mjs';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const desktop = path.join(root, 'desktop');

async function tempDir(prefix) { return mkdtemp(path.join(os.tmpdir(), prefix)); }

async function names(dir) { return (await readdir(dir)).sort(); }

test('payload installer replaces only studio and copies runtime allowlist', async (t) => {
  const home = await tempDir('pi-studio-payload-');
  t.after(() => import('node:fs/promises').then(({ rm }) => rm(home, { recursive: true, force: true })));
  const piDir = path.join(home, '.pi', 'agent');
  const destination = path.join(piDir, 'studio');
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(destination, 'stale.txt'), 'old');
  await writeFile(path.join(piDir, 'preserve.txt'), 'keep');
  await installPayload(root, piDir);
  assert.deepEqual(await names(destination), ['cli-lib.mjs', 'cli.mjs', 'desktop', 'lib-server', 'package.json', 'pi-studio.cmd', 'public', 'server.mjs', 'voice']);
  // Every relative import reachable from the installed server must exist in the installed copy. Before, lib-server/
  // was missing from the allowlist and the installed Studio died at boot with ERR_MODULE_NOT_FOUND.
  const pending = ['server.mjs'];
  const seen = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const text = await readFile(path.join(destination, file), 'utf8');
    for (const [, spec] of text.matchAll(/(?:from\s+|import\()\s*["'](\.{1,2}\/[^"']+)["']/g)) {
      const target = path.relative(destination, path.resolve(path.dirname(path.join(destination, file)), spec));
      await stat(path.join(destination, target));
      if (target.endsWith('.mjs') || target.endsWith('.js')) pending.push(target);
    }
  }
  assert.ok(seen.has(path.join('lib-server', 'tree.mjs')), 'server imports were walked');
  await stat(path.join(destination, 'voice', 'transcribe_worker.py'));
  assert.deepEqual(await names(path.join(destination, 'desktop')), (await names(desktop)).sort());
  for (const excluded of ['test', 'docker', 'Dockerfile', 'Dockerfile.dockerignore', 'docker-compose.yml', '.pi']) {
    await assert.rejects(stat(path.join(destination, excluded)));
  }
  assert.equal(await readFile(path.join(piDir, 'preserve.txt'), 'utf8'), 'keep');
  await assert.rejects(installPayload(root, root));
  const nestedSource = path.join(home, 'nested', 'studio');
  await mkdir(nestedSource, { recursive: true });
  await assert.rejects(installPayload(nestedSource, path.dirname(nestedSource)), /cannot be inside/);
});

test('both harness installers call the same isolated payload helper', async () => {
  const ps = await readFile(path.resolve(root, '..', 'install.ps1'), 'utf8');
  const sh = await readFile(path.resolve(root, '..', 'install.sh'), 'utf8');
  assert.match(ps, /desktop\\install-payload-cli\.mjs/);
  assert.match(sh, /desktop\/install-payload-cli\.mjs/);
  assert.match(ps, /Environment\]::GetFolderPath\('Desktop'\)/);
  assert.match(ps, /desktop\\install-app\.ps1/);
  assert.match(sh, /desktop\/install-app\.sh/);
});

test('payload installer preserves the prior install when staging fails', async (t) => {
  const home = await tempDir('pi-studio-payload-rollback-');
  t.after(() => import('node:fs/promises').then(({ rm }) => rm(home, { recursive: true, force: true })));
  const source = path.join(home, 'incomplete-source');
  const piDir = path.join(home, '.pi', 'agent');
  const destination = path.join(piDir, 'studio');
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(destination, 'keep.txt'), 'previous install');
  await mkdir(source, { recursive: true });
  await assert.rejects(installPayload(source, piDir));
  assert.equal(await readFile(path.join(destination, 'keep.txt'), 'utf8'), 'previous install');
});

test('payload command reports usage, success, and copy failures', async (t) => {
  const home = await tempDir('pi-studio-payload-command-');
  t.after(() => import('node:fs/promises').then(({ rm }) => rm(home, { recursive: true, force: true })));
  const output = { logs: [], errors: [], log(value) { this.logs.push(value); }, error(value) { this.errors.push(value); } };
  assert.equal(await installPayloadCommand([], output), 2);
  assert.match(output.errors[0], /Usage:/);
  const piDir = path.join(home, 'pi-agent');
  assert.equal(await installPayloadCommand([undefined, piDir], output), 0);
  assert.equal(output.logs[0], path.join(piDir, 'studio'));
  assert.equal(await installPayloadCommand([path.join(home, 'missing-source'), path.join(home, 'failed-agent')], output), 1);
  assert.match(output.errors[1], /ENOENT/);
});

test('macOS app bundle and terminal wrapper are created under the supplied temporary HOME', async (t) => {
  const home = await tempDir('pi-studio-macos-');
  t.after(() => import('node:fs/promises').then(({ rm }) => rm(home, { recursive: true, force: true })));
  const piDir = path.join(home, '.pi', 'agent');
  await installPayload(root, piDir);
  await execFileAsync('bash', [path.join(desktop, 'install-app.sh'), piDir, home], { env: { ...process.env, PI_STUDIO_TEST_OS: 'darwin' } });
  const app = path.join(home, 'Applications', 'PI Studio.app');
  const plist = await readFile(path.join(app, 'Contents', 'Info.plist'), 'utf8');
  assert.match(plist, /<key>CFBundleName<\/key><string>PI Studio<\/string>/);
  assert.match(plist, /<key>CFBundleIdentifier<\/key><string>com\.evolvera\.pistudio<\/string>/);
  assert.match(plist, /<key>CFBundleExecutable<\/key><string>PI Studio<\/string>/);
  assert.match(plist, /^<\?xml[\s\S]*<plist[\s\S]*<\/plist>\s*$/);
  if (process.platform === 'win32') {
    const plistPath = path.join(app, 'Contents', 'Info.plist').replaceAll("'", "''");
    const parsed = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', `[xml](Get-Content -Raw '${plistPath}') | Out-Null; Write-Output 'valid XML'`]);
    assert.match(parsed.stdout, /valid XML/);
  }
  assert.match(await readFile(path.join(app, 'Contents', 'MacOS', 'PI Studio'), 'utf8'), /^#!\/bin\/bash/);
  if (process.platform !== 'win32') assert.notEqual((await stat(path.join(piDir, 'studio', 'desktop', 'launch-macos.sh'))).mode & 0o111, 0);
  const cli = await readFile(path.join(piDir, 'bin', 'pi-studio'), 'utf8');
  assert.match(cli, /exec node .*\/studio\/cli\.mjs/);
});

test('Linux launcher entry is installed when install-app selects linux', async (t) => {
  const home = await tempDir('pi-studio-linux-');
  t.after(() => import('node:fs/promises').then(({ rm }) => rm(home, { recursive: true, force: true })));
  const piDir = path.join(home, '.pi', 'agent');
  await installPayload(root, piDir);
  await execFileAsync('bash', [path.join(desktop, 'install-app.sh'), piDir, home], { env: { ...process.env, PI_STUDIO_TEST_OS: 'linux' } });
  const entry = await readFile(path.join(home, '.local', 'share', 'applications', 'pi-studio.desktop'), 'utf8');
  assert.match(entry, /^\[Desktop Entry\]/m);
  assert.match(entry, /launch-unix\.sh/);
  assert.match(await readFile(path.join(piDir, 'studio', 'desktop', 'launch-unix.sh'), 'utf8'), /^#!\/bin\/bash/);
});

test('macOS launcher checks health before opening and owns its start/stop PID', async (t) => {
  if (process.platform !== 'darwin') return t.skip('launcher do macOS');
  const home = await tempDir('pi-studio-launcher-');
  const bin = path.join(home, 'fake-bin');
  const calls = path.join(home, 'calls');
  const marker = path.join(home, 'healthy');
  const starts = path.join(home, 'starts');
  await mkdir(bin);
  await writeFile(path.join(bin, 'curl'), `#!/bin/bash\n[ -f '${marker}' ] || exit 1\ncase "$*" in *api/health*) case "$*" in *X-PI-Studio-Token:*abcdef*) exit 0 ;; *) exit 1 ;; esac ;; *) printf '<meta name="pi-studio-token" content="abcdef">\\n' ;; esac\n`);
  await writeFile(path.join(bin, 'node'), `#!/bin/bash\necho start >>'${starts}'\ntouch '${marker}'\nexec sleep 86400\n`);
  await writeFile(path.join(bin, 'pi'), '#!/bin/sh\nexit 0\n');
  await writeFile(path.join(bin, 'open'), `#!/bin/bash\necho "$*" >>'${calls}'\nexit 0\n`);
  for (const name of ['curl', 'node', 'pi', 'open']) await (await import('node:fs/promises')).chmod(path.join(bin, name), 0o755);
  t.after(async () => {
    await execFileAsync('bash', [path.join(desktop, 'launch-macos.sh'), '--stop'], { env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` } }).catch(() => {});
    await import('node:fs/promises').then(({ rm }) => rm(home, { recursive: true, force: true }));
  });
  const env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, PI_STUDIO_NO_WINDOW: '0' };
  await execFileAsync('bash', [path.join(desktop, 'launch-macos.sh'), '--port', '4193'], { env });
  await execFileAsync('bash', [path.join(desktop, 'launch-macos.sh'), '--port', '4193'], { env });
  assert.equal((await readFile(starts, 'utf8')).trim().split('\\n').length, 1);
  assert.match(await readFile(calls, 'utf8'), /Google Chrome.*--app=http:\/\/127\.0\.0\.1:4193/);
  const callsBeforeNoWindow = await readFile(calls, 'utf8');
  await execFileAsync('bash', [path.join(desktop, 'launch-macos.sh'), '--port', '4193'], { env: { ...env, PI_STUDIO_NO_WINDOW: '1' } });
  assert.equal(await readFile(calls, 'utf8'), callsBeforeNoWindow);
  const pidFile = path.join(home, 'Library', 'Logs', 'PI Studio', 'server-4193.pid');
  assert.match(await readFile(pidFile, 'utf8'), /^\d+\s*$/);
  await execFileAsync('bash', [path.join(desktop, 'launch-macos.sh'), '--stop'], { env });
});

test('shell launchers stop only the requested port PID', async (t) => {
  const bash = await import('node:child_process').then(({ execFileSync }) => {
    try { return execFileSync('where.exe', ['bash'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0]; }
    catch { return 'bash'; }
  });
  for (const [name, statePath] of [['launch-macos.sh', ['Library', 'Logs', 'PI Studio']], ['launch-unix.sh', ['.local', 'state', 'pi-studio']]]) {
    const home = await tempDir(`pi-studio-${name}-pids-`);
    try {
      const logDir = path.join(home, ...statePath);
      const bin = path.join(home, 'fake-bin');
      await mkdir(logDir, { recursive: true });
      await mkdir(bin);
      const queried = path.join(home, 'queried');
      await writeFile(path.join(logDir, 'server.pid'), '99999998');
      await writeFile(path.join(logDir, 'server-4193.pid'), '99999999');
      await writeFile(path.join(bin, 'ps'), `#!/bin/sh\nprintf '%s\\n' "$2" >>'${queried}'\nprintf "server.mjs\\n"\n`);
      await import('node:fs/promises').then(({ chmod }) => chmod(path.join(bin, 'ps'), 0o755));
      const launcher = path.join(desktop, name);
      await execFileAsync(bash, [launcher, '--port', '4193', '--stop'], { env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` } });
      assert.equal(await readFile(path.join(logDir, 'server.pid'), 'utf8'), '99999998', `${name} must preserve default-port PID`);
      await assert.rejects(readFile(path.join(logDir, 'server-4193.pid'), 'utf8'), { code: 'ENOENT' });
      assert.equal((await readFile(queried, 'utf8')).trim(), '99999999');
    } finally {
      await import('node:fs/promises').then(({ rm }) => rm(home, { recursive: true, force: true }));
    }
  }
});

test('Windows launcher stops only the requested port PID', async (t) => {
  if (process.platform !== 'win32') return t.skip('PowerShell launcher is Windows-only');
  const home = await tempDir('pi-studio-windows-pids-');
  const logDir = path.join(home, 'PI Studio');
  await mkdir(logDir);
  const launcher = path.join(desktop, 'launch-windows.ps1').replaceAll("'", "''");
  const escapedHome = home.replaceAll("'", "''");
  const escapedLogDir = logDir.replaceAll("'", "''");
  const script = `$ErrorActionPreference='Stop'; $env:LOCALAPPDATA='${escapedHome}'; Set-Content -NoNewline -Path (Join-Path '${escapedLogDir}' 'server.pid') -Value 101; Set-Content -NoNewline -Path (Join-Path '${escapedLogDir}' 'server-4193.pid') -Value 202; function Get-CimInstance { param($ClassName,$Filter,$ErrorAction); [pscustomobject]@{ProcessId=202;CommandLine='node server.mjs'} }; function Stop-Process { param($Id,[switch]$Force); [System.IO.File]::AppendAllText('${escapedHome}\\stopped', [string]$Id) }; & '${launcher}' -Port 4193 -Stop; if ((Get-Content -Raw (Join-Path '${escapedLogDir}' 'server.pid')) -ne '101') { throw 'default-port PID file was removed' }; if (Test-Path (Join-Path '${escapedLogDir}' 'server-4193.pid')) { throw 'requested-port PID file was not removed' }; if ((Get-Content -Raw (Join-Path '${escapedHome}' 'stopped')) -ne '202') { throw 'wrong process was stopped' }`;
  await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script]);
});

test('Windows shortcut helper targets PowerShell launcher and uses a temp shortcut directory', async (t) => {
  if (process.platform !== 'win32') return t.skip('WScript.Shell shortcut COM is Windows-only');
  const home = await tempDir('pi-studio-shortcuts-');
  t.after(() => import('node:fs/promises').then(({ rm }) => rm(home, { recursive: true, force: true })));
  const piDir = path.join(home, '.pi', 'agent');
  await installPayload(root, piDir);
  const studio = path.join(piDir, 'studio');
  const desktopDir = path.join(home, 'Desktop');
  const startMenuDir = path.join(home, 'Start Menu', 'Programs', 'PI Studio');
  await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(desktop, 'install-app.ps1'), '-StudioDir', studio, '-DesktopDir', desktopDir, '-StartMenuDir', startMenuDir]);
  for (const dir of [desktopDir, startMenuDir]) assert.ok((await stat(path.join(dir, 'PI Studio.lnk'))).isFile());
  const desktopLink = path.join(desktopDir, 'PI Studio.lnk').replaceAll("'", "''");
  const inspected = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', `$link=(New-Object -ComObject WScript.Shell).CreateShortcut('${desktopLink}'); [pscustomobject]@{Target=$link.TargetPath;Arguments=$link.Arguments;Icon=$link.IconLocation} | ConvertTo-Json -Compress`]);
  const shortcut = JSON.parse(inspected.stdout);
  assert.match(shortcut.Target, /powershell\.exe$/i);
  assert.match(shortcut.Arguments, /launch-windows\.ps1/);
  assert.match(shortcut.Arguments, /WindowStyle Hidden/);
  assert.match(shortcut.Icon, /pi-studio\.ico,0$/);
  assert.equal((await readFile(path.join(studio, 'desktop', 'pi-studio.ico'))).readUInt16LE(2), 1);
});
