import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const sandbox = mkdtempSync(path.join(tmpdir(), "pi-sdk-resolution-smoke-"));
const previousRoot = process.env.PI_SDK_ROOT;
const helperUrl = new URL("./lib/pi-sdk.mjs", import.meta.url);

try {
  const fakeSdkRoot = path.join(sandbox, "sdk");
  mkdirSync(fakeSdkRoot);
  writeFileSync(path.join(fakeSdkRoot, "package.json"), "{}\n");
  process.env.PI_SDK_ROOT = fakeSdkRoot;
  const { resolvePiSdkRoot } = await import(helperUrl);
  assert.equal(resolvePiSdkRoot(import.meta.url), path.resolve(fakeSdkRoot),
    "PI_SDK_ROOT válido deve vencer as demais fontes");

  process.env.PI_SDK_ROOT = path.join(sandbox, "missing-sdk");
  assert.throws(() => resolvePiSdkRoot(import.meta.url), (error) => {
    assert.match(error.message, /PI_SDK_ROOT/);
    assert.match(error.message, /não encontrado/);
    assert.match(error.message, /missing-sdk/);
    return true;
  }, "PI_SDK_ROOT inválido deve falhar com as localizações tentadas");

  console.log("pi-sdk-resolution smoke: PASS");
} finally {
  if (previousRoot === undefined) delete process.env.PI_SDK_ROOT;
  else process.env.PI_SDK_ROOT = previousRoot;
  rmSync(sandbox, { recursive: true, force: true });
}
