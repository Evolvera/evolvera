import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ACCOUNT_LAUNCH_CONTEXT_ENV } from "./environment.mjs";
import {
  decodeAccountLaunchContext,
  encodeAccountLaunchContext,
  extractAccountLaunchContextArgs,
} from "./environment.mjs";

const WINDOWS_SHELLS = new Set(["cmd.exe", "powershell.exe", "pwsh.exe"]);
const SHELLS = new Set([...WINDOWS_SHELLS, "sh"]);
const fail = () => Object.assign(new Error("ACCOUNT_CHILD_COMMAND_INVALID"), { code: "ACCOUNT_CHILD_COMMAND_INVALID" });
const rejectControls = (value) => {
  if (typeof value !== "string" || /[\0\r\n]/.test(value)) throw fail();
  return value;
};

function canonicalEncodedContext(context) {
  if (typeof context === "string") return encodeAccountLaunchContext(decodeAccountLaunchContext(context));
  return encodeAccountLaunchContext(context);
}

function absoluteShellPath(value, shell) {
  rejectControls(value);
  const windows = WINDOWS_SHELLS.has(shell);
  const pathApi = windows ? path.win32 : path.posix;
  if (!pathApi.isAbsolute(value) || pathApi.resolve(value) !== value) throw fail();
  if (windows && !/^(?:[A-Za-z]:\\|\\\\)/.test(value)) throw fail();
  return value;
}

function quoteArgument(value, shell) {
  rejectControls(value);
  if (shell === "sh") return `'${value.replace(/'/g, "'\\''")}'`;
  if (shell === "powershell.exe" || shell === "pwsh.exe") return `'${value.replace(/'/g, "''")}'`;
  // cmd expands percent/bang even in quoted values; never interpolate those or quotes.
  if (shell === "cmd.exe") {
    if (/["%!]/.test(value)) throw fail();
    return `"${value.replace(/(\\+)$/, "$1$1")}"`;
  }
  throw fail();
}

function renderCommand({ encoded, nodePath, entrypointPath, shell, argv }) {
  if (!SHELLS.has(shell) || !Array.isArray(argv) || argv.some((value) => typeof value !== "string")) throw fail();
  const node = absoluteShellPath(nodePath, shell);
  const entrypoint = absoluteShellPath(entrypointPath, shell);
  const extracted = extractAccountLaunchContextArgs(argv);
  if (extracted.encoded !== undefined) throw fail();
  const args = [node, entrypoint, `--usuario-context=${encoded}`, ...extracted.argv].map((value) => quoteArgument(value, shell));

  if (shell === "sh") return `(unset PI_ACCOUNT_LAUNCH_CONTEXT; ${args.join(" ")})`;
  // This command is for a newly created terminal shell, not the existing PI parent.
  if (shell === "cmd.exe") return `set "PI_ACCOUNT_LAUNCH_CONTEXT=" & ${args.join(" ")}`;
  if (shell === "powershell.exe" || shell === "pwsh.exe") {
    return `& { $piContextPresent = Test-Path Env:PI_ACCOUNT_LAUNCH_CONTEXT; $piContextPrevious = $env:PI_ACCOUNT_LAUNCH_CONTEXT; try { Remove-Item Env:PI_ACCOUNT_LAUNCH_CONTEXT -ErrorAction SilentlyContinue; & ${args.join(" ")} } finally { if ($piContextPresent) { $env:PI_ACCOUNT_LAUNCH_CONTEXT = $piContextPrevious } else { Remove-Item Env:PI_ACCOUNT_LAUNCH_CONTEXT -ErrorAction SilentlyContinue } } }`;
  }
  throw fail();
}

/** Render an explicit account-bound child startup command without executing it. */
export function buildAccountChildCommand({ context, nodePath, entrypointPath, shell, argv = [] } = {}) {
  const encoded = canonicalEncodedContext(context);
  return renderCommand({ encoded, nodePath, entrypointPath, shell, argv });
}

/** Build the supported Orca terminal-create argv; the caller decides whether to invoke Orca. */
export function createOrcaChildLaunch({ context, nodePath, entrypointPath, shell, argv = [], worktree } = {}) {
  rejectControls(worktree);
  if (!worktree.trim()) throw fail();
  const command = buildAccountChildCommand({ context, nodePath, entrypointPath, shell, argv });
  const terminalArgv = ["terminal", "create", "--worktree", worktree];
  if (shell !== "sh") terminalArgv.push("--shell", shell);
  terminalArgv.push("--command", command, "--json");
  return Object.freeze({ command, argv: Object.freeze(terminalArgv) });
}

const launchFail = () => Object.assign(new Error("ACCOUNT_CHILD_LAUNCH_INVALID"), { code: "ACCOUNT_CHILD_LAUNCH_INVALID" });
const invocationFail = () => Object.assign(new Error("ACCOUNT_CHILD_INVOCATION_FAILED"), { code: "ACCOUNT_CHILD_INVOCATION_FAILED" });

/** Invoke Orca's explicit terminal-create command using only this process's published account context. */
export function launchOrcaAccountChild({ orcaCommand, nodePath, entrypointPath, shell, worktree, argv = [] } = {}, { env = process.env, spawn = spawnSync } = {}) {
  try {
    rejectControls(orcaCommand);
    if (!path.isAbsolute(orcaCommand) || path.resolve(orcaCommand) !== orcaCommand || typeof spawn !== "function") throw launchFail();
    const context = env?.[ACCOUNT_LAUNCH_CONTEXT_ENV];
    if (typeof context !== "string" || !context) throw launchFail();
    const plan = createOrcaChildLaunch({ context, nodePath, entrypointPath, shell, worktree, argv });
    const childEnv = { ...env };
    delete childEnv[ACCOUNT_LAUNCH_CONTEXT_ENV];
    let result;
    try {
      result = spawn(orcaCommand, plan.argv, { shell: false, stdio: "inherit", env: childEnv });
    } catch {
      throw invocationFail();
    }
    if (result?.error || result?.signal || !Number.isInteger(result?.status) || result.status < 0 || result.status > 255) throw invocationFail();
    return result.status;
  } catch (error) {
    if (error?.code === "ACCOUNT_CHILD_LAUNCH_INVALID" || error?.code === "ACCOUNT_CHILD_INVOCATION_FAILED" || error?.code === "ACCOUNT_CHILD_COMMAND_INVALID" || error?.code === "ACCOUNT_LAUNCH_CONTEXT_INVALID") throw error;
    throw launchFail();
  }
}

function parseCallerArgs(args) {
  const values = new Map();
  const nativeArgs = [];
  const flags = new Set(["--orca-command", "--node-path", "--entrypoint-path", "--shell", "--worktree"]);
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--arg") {
      if (index + 1 >= args.length) throw launchFail();
      nativeArgs.push(args[++index]);
    } else if (flags.has(flag)) {
      if (values.has(flag) || index + 1 >= args.length) throw launchFail();
      values.set(flag, args[++index]);
    } else {
      throw launchFail();
    }
  }
  for (const flag of flags) if (!values.has(flag)) throw launchFail();
  return { orcaCommand: values.get("--orca-command"), nodePath: values.get("--node-path"), entrypointPath: values.get("--entrypoint-path"), shell: values.get("--shell"), worktree: values.get("--worktree"), argv: nativeArgs };
}

async function runCli() {
  try {
    process.exitCode = launchOrcaAccountChild(parseCallerArgs(process.argv.slice(2)));
  } catch (error) {
    const code = ["ACCOUNT_CHILD_LAUNCH_INVALID", "ACCOUNT_CHILD_INVOCATION_FAILED", "ACCOUNT_CHILD_COMMAND_INVALID", "ACCOUNT_LAUNCH_CONTEXT_INVALID"].includes(error?.code) ? error.code : "ACCOUNT_CHILD_LAUNCH_INVALID";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await runCli();
