import assert from 'node:assert/strict';
import { defaultBashPaths, gitBashFor, shellPathToSet } from '../set-shell-path.mjs';

// STATEFUL RESOURCE PROOF: NO_STATEFUL_RESOURCES. Pure decisions with an injected file check; nothing is read or written.
const env = { ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)' };
const dBash = 'D:\\Program Files\\Git\\bin\\bash.exe';
assert.deepEqual(defaultBashPaths(env), ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe']);
assert.ok(gitBashFor('D:\\Program Files\\Git\\cmd\\git.exe').includes(dBash));
assert.ok(gitBashFor('D:\\Program Files\\Git\\mingw64\\bin\\git.exe').includes(dBash), 'the mingw64 git.exe Git Bash puts first on PATH');
assert.deepEqual(gitBashFor(null), []);

const onlyD = (file) => file === dBash;
const gitExes = ['D:\\Program Files\\Git\\mingw64\\bin\\git.exe', 'D:\\Program Files\\Git\\cmd\\git.exe'];
assert.equal(shellPathToSet({ settings: {}, platform: 'win32', env, exists: onlyD, gitExes }), dBash, 'Git on D: is pointed at');
assert.equal(shellPathToSet({ settings: { shellPath: 'C:\\msys64\\usr\\bin\\bash.exe' }, platform: 'win32', env, exists: onlyD, gitExes }), null, "the person's choice is kept");
assert.equal(shellPathToSet({ settings: {}, platform: 'win32', env, exists: (file) => file.startsWith('C:\\Program Files\\Git'), gitExes }), null, 'PI already finds Git under Program Files');
assert.equal(shellPathToSet({ settings: {}, platform: 'win32', env, exists: () => false, gitExes }), null, 'no Git Bash anywhere: nothing written');
assert.equal(shellPathToSet({ settings: {}, platform: 'linux', env, exists: onlyD, gitExes }), null, 'only Windows');
console.log('set-shell-path smoke: PASS');
