import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { launchUser } from "../users/launcher.mjs";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-native-update-"));
const fakeSdkRoot = path.join(root, "fake-sdk");
const stageParent = path.join(root, "empty-stage-parent");
const registryPath = path.join(root, "registry-must-not-exist.json");
const mainPath = path.join(fakeSdkRoot, "dist", "main.js");
fs.mkdirSync(path.dirname(mainPath), { recursive: true });
fs.mkdirSync(stageParent);
fs.writeFileSync(path.join(fakeSdkRoot, "package.json"), '{"type":"module"}\n', { flag: "wx" });
fs.writeFileSync(mainPath, `export async function main(argv, options) { globalThis.__piNativeUpdateCalls.push({ argv, options }); }\n`, { flag: "wx" });
globalThis.__piNativeUpdateCalls = [];

const capture = () => globalThis.__piNativeUpdateCalls.at(-1);
const nativeOptions = { sentinel: "native-options-preserved" };

test("update and established early commands dispatch to stock SDK main without account staging", async () => {
  for (const argv of [["update", "--check"], ["--version"], ["package", "list"], ["config", "get"]]) {
    const env = {};
    await launchUser(argv, {
      packageRoot: fakeSdkRoot,
      registryPath,
      pickAccount: () => { throw new Error("account selection must not occur"); },
      stageParent,
      env,
      nativeOptions,
    });
    assert.deepEqual(capture(), { argv, options: nativeOptions }, `native SDK receives argv unchanged for ${argv[0]}`);
    assert.equal(Object.hasOwn(env, "PI_ACCOUNT_LAUNCH_CONTEXT"), false, "native invocation does not publish account context");
    assert.equal(fs.existsSync(registryPath), false, "registry remains untouched");
    assert.deepEqual(fs.readdirSync(stageParent), [], "SDK stage remains absent");
  }
});

test("only argv[0] update is an early command; trailing update stays on the account path", async () => {
  const source = fs.readFileSync(path.join(repo, "scripts/users/launcher.mjs"), "utf8");
  assert.match(source, /return argv\.some\(\(argument\) => \["--version", "-v"\]\.includes\(argument\)\) \|\| argv\[0\] === "package" \|\| argv\[0\] === "config" \|\| argv\[0\] === "update";/u);

  const factory = () => "account-factory-sentinel";
  let observed;
  await launchUser(["--help", "update"], {
    nativeMain: async (argv, options) => { observed = { argv, options }; },
    accountRuntimeFactory: factory,
    nativeOptions,
  });
  assert.deepEqual(observed, {
    argv: ["--help", "update"],
    options: { ...nativeOptions, accountRuntimeFactory: factory },
  }, "non-leading update remains an ordinary account-aware invocation");
});
