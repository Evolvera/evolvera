import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateSdkPackage } from "./sdk-stage.mjs";

const DEFAULT_LAUNCHER = fileURLToPath(new URL("./launcher.mjs", import.meta.url));
const PATH_FIELDS = ["binDir", "nodePath", "launcherPath", "sdkRoot"];

function fail(message) { throw new Error(`ENTRYPOINTS_INVALID: ${message}`); }

function validatePath(value, name, platform) {
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  if (typeof value !== "string" || !pathApi.isAbsolute(value) || value.includes("\0") || value.includes('"') || value.includes("'")) {
    fail(`${name} must be an explicit absolute path`);
  }
  if (platform === "win32" && /[%!^&|<>\r\n]/u.test(value)) fail(`${name} contains an unsafe command character`);
  if (platform === "posix" && /[\r\n]/u.test(value)) fail(`${name} contains an unsafe command character`);
  return pathApi.normalize(value);
}

function powershellQuote(value) { return `'${value.replaceAll("'", "''")}'`; }
function shellQuote(value) { return `'${value.replaceAll("'", "'\\''")}'`; }

export function renderPiEntrypoints({ binDir, nodePath = process.execPath, launcherPath = DEFAULT_LAUNCHER, sdkRoot, platform } = {}) {
  if (platform !== "win32" && platform !== "posix") fail("platform must be win32 or posix");
  if (binDir === undefined || sdkRoot === undefined) fail("binDir and sdkRoot are required");
  const paths = Object.fromEntries(PATH_FIELDS.map((key) => [key, validatePath(key === "nodePath" ? nodePath : key === "launcherPath" ? launcherPath : key === "sdkRoot" ? sdkRoot : binDir, key, platform)]));
  const join = platform === "win32" ? path.win32.join : path.posix.join;
  const bootstrapPath = join(paths.binDir, "pi-account-entry.mjs");
  const bootstrap = `import { launchUser } from ${JSON.stringify(pathToFileURL(paths.launcherPath, { windows: platform === "win32" }).href)};\n\nlaunchUser(process.argv.slice(2), { packageRoot: ${JSON.stringify(paths.sdkRoot)} }).catch((error) => {\n  const code = typeof error?.code === "string" && /^[A-Z][A-Z0-9_]{1,80}$/.test(error.code) ? error.code : "USER_LAUNCH_FAILED";\n  process.stderr.write(code + "\\n");\n  if (process.env.PI_DEBUG !== undefined && typeof error?.message === "string") process.stderr.write(error.message + "\\n");\n  process.exitCode = 1;\n});\n`;
  let entries;
  if (platform === "win32") {
    const node = paths.nodePath;
    const boot = bootstrapPath;
    entries = [
      { path: join(paths.binDir, "pi.cmd"), content: `@ECHO off\r\n"${node}" "${boot}" %*\r\nEXIT /b %ERRORLEVEL%\r\n`, mode: 0o644 },
      { path: join(paths.binDir, "pi.ps1"), content: `$ErrorActionPreference = 'Stop'\n$node = ${powershellQuote(node)}\n$bootstrap = ${powershellQuote(boot)}\nif ($MyInvocation.ExpectingInput) { $input | & $node $bootstrap @args } else { & $node $bootstrap @args }\nexit $LASTEXITCODE\n`, mode: 0o644 },
      { path: join(paths.binDir, "pi"), content: `#!/bin/sh\nexec ${shellQuote(node.replaceAll("\\", "/"))} ${shellQuote(boot.replaceAll("\\", "/"))} "$@"\n`, mode: 0o755 },
    ];
  } else {
    const command = `exec ${shellQuote(paths.nodePath)} ${shellQuote(bootstrapPath)} "$@"`;
    entries = [
      { path: join(paths.binDir, "pi"), content: `#!/bin/sh\n${command}\n`, mode: 0o755 },
    ];
  }
  return [{ path: bootstrapPath, content: bootstrap, mode: 0o644 }, ...entries];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const allowed = new Set(["--bin-dir", "--sdk-root", "--node-path", "--launcher-path", "--platform"]);
    const options = {};
    const names = { "--bin-dir": "binDir", "--sdk-root": "sdkRoot", "--node-path": "nodePath", "--launcher-path": "launcherPath", "--platform": "platform" };
    for (let i = 2; i < process.argv.length; i += 2) {
      const flag = process.argv[i];
      if (!allowed.has(flag) || Object.hasOwn(options, names[flag]) || i + 1 >= process.argv.length || process.argv[i + 1].startsWith("--")) fail("unknown, duplicate, or missing flag value");
      options[names[flag]] = process.argv[i + 1];
    }
    await validateSdkPackage(options.sdkRoot);
    process.stdout.write(`${JSON.stringify(renderPiEntrypoints(options))}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
