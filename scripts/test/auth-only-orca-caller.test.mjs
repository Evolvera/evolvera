import assert from "node:assert/strict";
import test from "node:test";
import { encodeAccountLaunchContext, ACCOUNT_LAUNCH_CONTEXT_ENV } from "../users/environment.mjs";
import { createOrcaChildLaunch, launchOrcaAccountChild } from "../users/child-command.mjs";

const registryPath = "C:\\pi-userdata\\users.json";
const encode = (accountId) => encodeAccountLaunchContext({ version: 1, accountId, registryPath });
const options = (accountId = "alpha", argv = []) => ({
  orcaCommand: "C:\\Orca\\orca.exe",
  nodePath: "C:\\Pi\\node.exe",
  entrypointPath: "C:\\Pi\\pi-account-entry.mjs",
  shell: "powershell.exe",
  worktree: "child-worktree",
  argv,
});
const environment = (encoded = encode("alpha")) => ({
  SystemRoot: "C:\\Windows",
  HOME: "C:\\run-owned\\home",
  [ACCOUNT_LAUNCH_CONTEXT_ENV]: encoded,
});

test("invokes Orca once with renderer argv, explicit process isolation, and unchanged parent env", () => {
  for (const accountId of ["alpha", "beta"]) {
    const parentEnv = environment(encode(accountId));
    const before = { ...parentEnv };
    const spawnCalls = [];
    const status = launchOrcaAccountChild(options(accountId, ["space here", "it's", "--", "--literal"]), {
      env: parentEnv,
      spawn: (...args) => { spawnCalls.push(args); return { status: 0, signal: null, error: null }; },
    });
    const expected = createOrcaChildLaunch({ ...options(accountId, ["space here", "it's", "--", "--literal"]), context: before[ACCOUNT_LAUNCH_CONTEXT_ENV] });
    assert.equal(status, 0);
    assert.equal(spawnCalls.length, 1);
    assert.equal(spawnCalls[0][0], options().orcaCommand);
    assert.deepEqual(spawnCalls[0][1], expected.argv);
    assert.equal(spawnCalls[0][2].shell, false);
    assert.equal(spawnCalls[0][2].stdio, "inherit");
    assert.equal(spawnCalls[0][2].env[ACCOUNT_LAUNCH_CONTEXT_ENV], undefined);
    assert.equal(parentEnv[ACCOUNT_LAUNCH_CONTEXT_ENV], before[ACCOUNT_LAUNCH_CONTEXT_ENV]);
    assert.deepEqual(parentEnv, before);
    assert.match(spawnCalls[0][1][spawnCalls[0][1].indexOf("--command") + 1], /'space here'.*'it''s'/);
  }
});

test("missing, malformed, duplicate context and invalid explicit Orca path fail before spawn", () => {
  let calls = 0;
  const spawn = () => { calls += 1; return { status: 0 }; };
  assert.throws(() => launchOrcaAccountChild(options(), { env: {}, spawn }));
  assert.throws(() => launchOrcaAccountChild(options(), { env: environment("not-base64!"), spawn }));
  assert.throws(() => launchOrcaAccountChild(options("alpha", ["--usuario-context=other"]), { env: environment(), spawn }));
  assert.throws(() => launchOrcaAccountChild({ ...options(), orcaCommand: "orca.exe" }, { env: environment(), spawn }));
  assert.equal(calls, 0);
});

test("retains repeated literal arguments, renderer quoting, and valid nonzero exit status", () => {
  const argv = ["space value", "it's", "ampersand&pipe|", "--", "--usuario-context", "literal"];
  const spawnCalls = [];
  const status = launchOrcaAccountChild(options("beta", argv), {
    env: environment(encode("beta")),
    spawn: (...args) => { spawnCalls.push(args); return { status: 23, signal: null }; },
  });
  assert.equal(status, 23);
  const command = spawnCalls[0][1][spawnCalls[0][1].indexOf("--command") + 1];
  assert.match(command, /'it''s'/);
  assert.match(command, /'ampersand&pipe\|'/);
  assert.match(command, /'--usuario-context' 'literal'/);
  const expected = createOrcaChildLaunch({ ...options(), context: encode("beta"), argv });
  assert.deepEqual(spawnCalls[0][1], expected.argv);
});

test("spawn errors, signals, and invalid statuses fail closed", () => {
  for (const result of [{ error: new Error("secret path"), status: null }, { status: null, signal: "SIGTERM" }, { status: 256 }, {}]) {
    let calls = 0;
    assert.throws(() => launchOrcaAccountChild(options(), {
      env: environment(), spawn: () => { calls += 1; return result; },
    }), { code: "ACCOUNT_CHILD_INVOCATION_FAILED" });
    assert.equal(calls, 1);
  }
});

test("failed synchronous spawn is a stable redacted invocation error", () => {
  assert.throws(() => launchOrcaAccountChild(options(), {
    env: environment(), spawn: () => { throw new Error("secret details"); },
  }), { code: "ACCOUNT_CHILD_INVOCATION_FAILED" });
});
