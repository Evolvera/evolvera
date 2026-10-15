import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { launchUser } from "../users/launcher.mjs";

test("default account SDK stage parent canonicalizes an aliased TMPDIR before staging", async () => {
  const canonicalTmp = fs.realpathSync.native(os.tmpdir());
  const runRoot = fs.mkdtempSync(path.join(canonicalTmp, "pi-launcher-temp-regression-"));
  const realTemp = path.join(runRoot, "real-temp");
  const tempAlias = path.join(runRoot, "tmp-alias");
  const sdkRoot = path.join(runRoot, "sdk-real");
  const sdkAlias = path.join(runRoot, "sdk-alias");
  fs.mkdirSync(realTemp);
  fs.mkdirSync(sdkRoot);
  fs.symlinkSync(realTemp, tempAlias, "dir");
  fs.symlinkSync(sdkRoot, sdkAlias, "dir");

  const priorTmpdir = process.env.TMPDIR;
  try {
    process.env.TMPDIR = tempAlias;
    assert.equal(os.tmpdir(), tempAlias, "the synthetic environment exposes the symlink alias");
    assert.equal(fs.realpathSync.native(os.tmpdir()), realTemp);

    const oldExpressionParent = fs.mkdtempSync(path.join(os.tmpdir(), "old-expression-probe-"));
    assert.notEqual(fs.realpathSync.native(oldExpressionParent), oldExpressionParent,
      "the former mkdtemp(os.tmpdir()) expression produces an alias path");

    // Observe the actual allocation path: rebuilding it from realTemp would hide
    // a regression because both lexical paths reach the same physical directory.
    const allocations = [];
    const originalMkdtemp = fs.mkdtempSync;
    fs.mkdtempSync = function (prefix, ...args) {
      const result = originalMkdtemp.call(fs, prefix, ...args);
      allocations.push({ prefix, result });
      return result;
    };
    try {
      await assert.rejects(
        launchUser(["--help"], { packageRoot: sdkAlias }),
        /path is not a real directory/u,
      );
    } finally {
      fs.mkdtempSync = originalMkdtemp;
    }
    assert.equal(allocations.length, 1);
    assert.equal(allocations[0].prefix, path.join(realTemp, "pi-account-sdk-"));
    assert.equal(allocations[0].result, fs.realpathSync.native(allocations[0].result));
    assert.notEqual(path.dirname(oldExpressionParent), path.dirname(allocations[0].result));

    const created = fs.readdirSync(realTemp).filter((name) => name.startsWith("pi-account-sdk-"));
    assert.equal(created.length, 1, "launchUser created exactly one fresh default stage parent");
    const stageParent = path.join(realTemp, created[0]);
    assert.match(created[0], /^pi-account-sdk-/u);
    assert.equal(fs.lstatSync(stageParent).isSymbolicLink(), false);
    assert.equal(fs.realpathSync.native(stageParent), stageParent, "stage parent is a canonical real directory");
    assert.ok(fs.readdirSync(tempAlias).includes(created[0]), "canonical stage parent is visible through the alias");

    const explicitStageParent = path.join(runRoot, "explicit-stage-parent");
    fs.mkdirSync(explicitStageParent);
    await assert.rejects(
      launchUser(["--help"], { packageRoot: sdkAlias, stageParent: explicitStageParent }),
      /path is not a real directory/u,
    );
    assert.deepEqual(fs.readdirSync(explicitStageParent), [], "explicit stageParent is used without default-temp allocation");
    assert.equal(fs.readdirSync(realTemp).filter((name) => name.startsWith("pi-account-sdk-")).length, 1,
      "an explicit stageParent does not trigger another default stage allocation");
  } finally {
    if (priorTmpdir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = priorTmpdir;
  }
});
