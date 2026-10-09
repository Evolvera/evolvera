import os from "node:os";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import readline from "node:readline";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createUserRuntime, runUserMode } from "./runtime.mjs";
import { prepareSdkStage } from "./sdk-stage.mjs";
import { transformMainSource, transformMigrationsSource } from "./sdk-cli-source.mjs";
import { transformModelRuntimeSource, transformModelConfigSource } from "./sdk-auth-source.mjs";
import { defaultRegistryPath, resolveUser } from "./registry.mjs";
import { createAccount } from "./account-session.mjs";
import { createUserEnvironment, installUserEnvironment } from "./environment.mjs";

const SCRIPT = fileURLToPath(import.meta.url);
const fail = (code) => Object.assign(new Error(code), { code });

function parse(argv) {
  if (argv[0] !== "use" || !argv[1]) throw fail("USAGE: use <id> --cwd <owned-path> [--mode interactive|rpc|text|json] [--message text]");
  const result = { id: argv[1], mode: "interactive", message: undefined };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--cwd" || key === "--mode" || key === "--message" || key === "--registry") {
      const value = argv[++i];
      if (!value) throw fail("LAUNCH_ARGUMENT_MISSING");
      if (key === "--cwd") result.cwd = value;
      else if (key === "--mode") result.mode = value;
      else if (key === "--message") result.message = value;
      else result.registryPath = value;
    } else throw fail("LAUNCH_ARGUMENT_UNKNOWN");
  }
  if (!result.cwd || !path.isAbsolute(result.cwd)) throw fail("LAUNCH_CWD_REQUIRED");
  if (!["interactive", "rpc", "text", "json"].includes(result.mode)) throw fail("LAUNCH_MODE_INVALID");
  if ((result.mode === "text" || result.mode === "json") && !result.message) throw fail("LAUNCH_MESSAGE_REQUIRED");
  return result;
}

function spawnSelected(args, profile, spawnProcess = spawn) {
  const env = createUserEnvironment(profile, { sessionDir: profile.sessionRoots[0] });
  const child = spawnProcess(process.execPath, [SCRIPT, "--managed-child", args.id, args.cwd, args.mode, args.message ?? "", profile.registryPath], {
    cwd: args.cwd,
    env: { ...env },
    stdio: "inherit",
    windowsHide: false,
  });
  return new Promise((resolve, reject) => {
    child.once("error", () => reject(fail("LAUNCH_CHILD_FAILED")));
    child.once("close", (code, signal) => resolve(signal ? 1 : code ?? 1));
  });
}

const SWITCH_PROTOCOL = "pi-user-handoff-v1";
const SWITCH_TIMEOUT = 15_000;
const nonce = () => randomBytes(24).toString("hex");
const validBinding = (binding) => binding && /^[a-f0-9]{48}$/.test(binding.run) && /^[a-f0-9]{48}$/.test(binding.nonce) && Number.isSafeInteger(binding.parentPid) && binding.parentPid > 0 && /^[a-f0-9]{64}$/.test(binding.profileToken);
const switchEnvelope = (binding, type, detail = {}) => ({ protocol: SWITCH_PROTOCOL, ...binding, type, ...detail });

function createChildSwitchChannel(binding, profile) {
  if (!validBinding(binding) || binding.parentPid !== process.ppid || !process.send || !process.connected) throw fail("USER_SWITCH_CHANNEL_INVALID");
  const identity = { ...binding, originPid: process.pid, profile: profile.id };
  let pending, serial = 0, disposed = false;
  const matches = (message) => message?.protocol === SWITCH_PROTOCOL && Object.keys(identity).every((key) => message[key] === identity[key]);
  const send = (type, detail, callback) => {
    if (disposed || !process.connected) throw fail("USER_SWITCH_CHANNEL_CLOSED");
    process.send(switchEnvelope(identity, type, detail), callback);
  };
  const onMessage = (message) => {
    if (!matches(message) || !pending || message.request !== pending.request || message.type !== "reply") return;
    const wait = pending; pending = undefined; clearTimeout(wait.timer);
    if (message.ok === true) wait.resolve(message);
    else wait.reject(fail("USER_SWITCH_SUPERVISOR_REFUSED"));
  };
  const onDisconnect = () => {
    if (pending) { clearTimeout(pending.timer); pending.reject(fail("USER_SWITCH_CHANNEL_CLOSED")); pending = undefined; }
  };
  // Callbacks precede runtime/SDK construction; no global selector or SDK callback is exposed.
  process.on("message", onMessage);
  process.on("disconnect", onDisconnect);
  const request = (type, detail) => new Promise((resolve, reject) => {
    if (pending) return reject(fail("USER_SWITCH_CHANNEL_BUSY"));
    const request = ++serial;
    const timer = setTimeout(() => {
      if (pending?.request !== request) return;
      pending = undefined;
      // Runtime releases its lease before sending cancellation; never reopen transport first.
      reject(fail("USER_SWITCH_CHANNEL_TIMEOUT"));
    }, SWITCH_TIMEOUT);
    pending = { request, timer, resolve, reject };
    try {
      send(type, { ...detail, request }, (error) => {
        if (!error || pending?.request !== request) return;
        clearTimeout(timer); pending = undefined; reject(fail("USER_SWITCH_CHANNEL_SEND_FAILED"));
      });
    } catch (error) { clearTimeout(timer); pending = undefined; reject(error); }
  });
  return Object.freeze({
    prepare: (detail) => request("prepare", detail),
    commit: (detail) => request("commit", detail),
    shutdownRequested(detail) {
      send("shutdown-requested", detail, (error) => { if (error) process.stderr.write("USER_SWITCH_SHUTDOWN_RECEIPT_FAILED\n"); });
    },
    cancel(detail) { try { send("cancel", detail); } catch { process.stderr.write("USER_SWITCH_CANCEL_UNPROVED\n"); } },
    dispose() {
      disposed = true; onDisconnect();
      process.off("message", onMessage); process.off("disconnect", onDisconnect);
      if (process.connected) process.disconnect();
    },
  });
}

async function superviseRpc(args, initialProfile, spawnProcess) {
  const { assertOwnedSession, assertOwnedWorkspace } = await import("./ownership.mjs");
  const { preflightUserSwitch, getUserProfileToken } = await import("./runtime.mjs"); // Module evaluation does not import SDK or read credentials.
  const run = nonce();
  let selected = initialProfile, selectedArgs = args, record, stopped = false, inputEnded = false, savedOrigin, savedOriginClosed = false;
  const reader = readline.createInterface({ input: process.stdin, terminal: false });
  let inputBuffer = [];
  const writeError = (command, code) => process.stdout.write(`${JSON.stringify({ type: "response", id: command?.id, command: command?.type, success: false, error: code })}\n`);
  const forward = (line) => {
    let command, parseFailed = false;
    try { command = JSON.parse(line); } catch { parseFailed = true; /* Native RPC owns parse errors. */ }
    if (!record || !record.ready) { inputBuffer.push(line); return; }
    if (record.handoff) { writeError(command, "USER_SWITCH_TRANSPORT_FENCED"); return; }
    // Native command dispatch and responses stay native; this is only the owned pipe fence.
    const entry = { id: command?.id, command, responseCommand: parseFailed ? "parse" : command?.type };
    if (command?.type !== "extension_ui_response") record.inflight.push(entry);
    record.child.stdin.write(`${line}\n`);
  };
  const onLine = (line) => { if (!stopped) forward(line); };
  const onEnd = () => { inputEnded = true; if (record?.ready && !record.handoff) record.child.stdin.end(); };
  reader.on("line", onLine); reader.on("close", onEnd);
  try {
    for (;;) {
      const binding = { run, nonce: nonce(), parentPid: process.pid, profileToken: getUserProfileToken(selected) };
      const env = createUserEnvironment(selected, { sessionDir: selected.sessionRoots[0] });
      let child;
      try {
        child = spawnProcess(process.execPath, [SCRIPT, "--managed-child", selected.id, selectedArgs.cwd, "rpc", "", selected.registryPath, JSON.stringify(binding), selectedArgs.initialSessionPath ?? ""],
          { cwd: selectedArgs.cwd, env: { ...env }, stdio: ["pipe", "pipe", "pipe", "ipc"], windowsHide: false });
      } catch { throw fail(savedOrigin ? "USER_SWITCH_RELAUNCH_FAILED_OWN_ORIGIN_RECOVERABLE" : "LAUNCH_CHILD_FAILED"); }
      const r = { child, ready: false, inflight: [], handoff: undefined, shutdown: false, failed: false, buffer: "", wake: `usuario-wake-${binding.nonce}`, shutdownTimer: undefined };
      record = r;
      const closed = new Promise((resolve) => child.once("close", (code, signal) => resolve({ code, signal })));
      const pipes = Promise.all([child.stdin, child.stdout, child.stderr].map((stream) => new Promise((resolve) => stream.once("close", resolve))));
      const error = () => { r.failed = true; process.stderr.write("USER_SWITCH_OWN_CHILD_IO_FAILED\n"); };
      for (const handle of [child, child.stdin, child.stdout, child.stderr]) handle.on("error", error);
      const bound = (message) => message?.protocol === SWITCH_PROTOCOL && message.run === binding.run && message.nonce === binding.nonce && message.parentPid === process.pid && message.profileToken === binding.profileToken && message.originPid === child.pid && message.profile === selected.id;
      const releaseTransport = () => {
        r.handoff = undefined;
        if (inputEnded && r.ready && !child.stdin.writableEnded) child.stdin.end();
      };
      const reply = (message, ok) => {
        if (!child.connected) { r.failed = true; return; }
        child.send(switchEnvelope({ ...binding, originPid: child.pid, profile: selected.id }, "reply", { request: message.request, ok }), (failure) => { if (failure) r.failed = true; });
      };
      const sameIntent = (message, intent) => intent && ["sessionPath", "sessionId", "target", "targetToken", "cwd"].every((key) => message[key] === intent[key]);
      child.on("message", (message) => {
        if (!bound(message)) { if (message?.protocol === SWITCH_PROTOCOL) process.stderr.write("USER_SWITCH_FORGED_OR_STALE_IPC\n"); return; }
        if (message.type === "ready" && !r.ready) {
          r.ready = true;
          for (const line of inputBuffer.splice(0)) forward(line);
          if (inputEnded && !r.handoff) child.stdin.end();
          return;
        }
        if (message.type === "cancel") {
          if (!r.shutdown && sameIntent(message, r.handoff)) releaseTransport();
          return;
        }
        if (message.type === "prepare") {
          if (r.handoff || !r.ready || inputEnded || !Number.isSafeInteger(message.request)) return reply(message, false);
          // Freeze transport before preflight/checks; never cancel/drain accepted requests.
          r.handoff = { sessionPath: message.sessionPath, sessionId: message.sessionId, target: message.target, targetToken: message.targetToken, cwd: message.cwd };
          try {
            assertOwnedSession(selected, { sessionPath: message.sessionPath, cwd: selectedArgs.cwd });
            if (typeof message.sessionId !== "string" || !message.sessionId) throw fail("USER_SWITCH_SESSION_INVALID");
            const target = resolveUser({ registryPath: selected.registryPath, id: message.target });
            const destination = preflightUserSwitch(target, message.cwd);
            if (destination.token !== message.targetToken) throw fail("USER_SWITCH_TARGET_DRIFT");
            assertOwnedWorkspace(target, destination.cwd);
            // Only this exact slash request may be waiting; any other native request refuses.
            if (r.inflight.length !== 1 || r.inflight[0].command?.type !== "prompt" || r.inflight[0].command.message?.trim() !== `/usuario use ${message.target}`) throw fail("USER_SWITCH_RPC_PENDING");
            reply(message, true);
          } catch { releaseTransport(); reply(message, false); }
          return;
        }
        if (message.type === "commit") {
          try {
            if (!sameIntent(message, r.handoff) || r.shutdown || r.failed || r.inflight.length !== 1) throw fail("USER_SWITCH_COMMIT_INVALID");
            assertOwnedSession(selected, { sessionPath: message.sessionPath, cwd: selectedArgs.cwd });
            if (preflightUserSwitch(resolveUser({ registryPath: selected.registryPath, id: message.target }), message.cwd).token !== message.targetToken) throw fail("USER_SWITCH_TARGET_DRIFT");
            r.handoff.committed = true;
            savedOrigin = Object.freeze({ id: selected.id, cwd: selectedArgs.cwd, registryPath: selected.registryPath, sessionPath: message.sessionPath, sessionId: message.sessionId, originPid: child.pid, run: binding.run, nonce: binding.nonce, profileToken: binding.profileToken });
            savedOriginClosed = false;
            reply(message, true);
          } catch { reply(message, false); } // Hold transport until the child's post-release cancellation.
          return;
        }
        if (message.type === "shutdown-requested") {
          if (!r.handoff?.committed || !sameIntent(message, r.handoff) || r.shutdown) { r.failed = true; return; }
          r.shutdown = true;
          r.shutdownTimer = setTimeout(() => {
            r.failed = true;
            process.stderr.write(`USER_SWITCH_SHUTDOWN_UNVERIFIED: no successor or forced termination; own origin ${JSON.stringify(savedOrigin)}\n`);
          }, SWITCH_TIMEOUT);
          r.shutdownTimer.unref();
          // Async slash callbacks can miss RPC's first shutdown check. This readonly native request wakes it.
          child.stdin.write(`${JSON.stringify({ type: "get_state", id: r.wake })}\n`);
        }
      });
      child.stdout.setEncoding("utf8").on("data", (chunk) => {
        r.buffer += chunk;
        let end;
        while ((end = r.buffer.indexOf("\n")) !== -1) {
          const line = r.buffer.slice(0, end); r.buffer = r.buffer.slice(end + 1);
          let message;
          try { message = JSON.parse(line); } catch { /* Preserve native stdout, including errors. */ }
          if (message?.type === "response") {
            if (message.id === r.wake) continue; // Internal readonly wake has no caller response.
            const index = r.inflight.findIndex((entry) => entry.id === message.id && entry.responseCommand === message.command);
            if (index !== -1) r.inflight.splice(index, 1);
          }
          process.stdout.write(`${line}\n`);
        }
      });
      child.stderr.on("data", (chunk) => process.stderr.write(chunk));
      const result = await closed; // Never spawn a successor on an exit/message/synthetic receipt alone.
      clearTimeout(r.shutdownTimer);
      await pipes;
      if (savedOrigin?.originPid === child.pid && r.shutdown && result.code === 0 && !result.signal) savedOriginClosed = true;
      if (r.buffer) process.stdout.write(r.buffer);
      if (!r.ready && savedOriginClosed) throw fail("USER_SWITCH_RELAUNCH_STARTUP_FAILED_OWN_ORIGIN_RECOVERABLE");
      if (!r.shutdown || !r.handoff?.committed || r.failed || result.signal || result.code !== 0) {
        if (savedOrigin && (r.handoff || r.failed)) process.stderr.write(`USER_SWITCH_FAILED: explicit own-origin recovery ${JSON.stringify(savedOrigin)}\n`);
        return result.signal || r.failed || r.handoff ? 1 : result.code ?? 1;
      }
      const target = resolveUser({ registryPath: selected.registryPath, id: r.handoff.target });
      if (preflightUserSwitch(target, r.handoff.cwd).token !== r.handoff.targetToken) throw fail("USER_SWITCH_TARGET_DRIFT");
      selected = target;
      selectedArgs = { ...args, id: target.id, cwd: r.handoff.cwd, initialSessionPath: undefined }; // New process only; runtime receipts never reassigned.
    }
  } catch (error) {
    if (savedOrigin) process.stderr.write(`USER_SWITCH_FAILED: explicit own-origin recovery ${JSON.stringify(savedOrigin)}\n`);
    if (savedOriginClosed) {
      // Unserializable capability captures THIS closed origin; callers cannot substitute a profile/session.
      const origin = savedOrigin;
      Object.defineProperty(error, "ownOrigin", { value: origin });
      Object.defineProperty(error, "recoverOwnOrigin", { value: (recoveryOptions = {}) => launchUser(
        ["use", origin.id, "--cwd", origin.cwd, "--mode", "rpc", "--registry", origin.registryPath],
        { ...recoveryOptions, initialSessionPath: origin.sessionPath, originProfileToken: origin.profileToken }),
      });
    }
    throw error;
  } finally {
    stopped = true; reader.off("line", onLine); reader.off("close", onEnd); reader.close();
    process.stdin.pause();
  }
}

async function runChild([, , id, cwd, mode, message, registryPath, bindingText, initialSessionPath]) {
  if (!id || !cwd || !registryPath) throw fail("LAUNCH_CHILD_ARGUMENT_INVALID");
  const { resolveUser } = await import("./registry.mjs");
  const profile = resolveUser({ id, registryPath });
  installUserEnvironment(profile);
  if (process.env.PI_USER_ID !== id || process.env.PI_CODING_AGENT_DIR !== profile.agentDir || path.resolve(os.homedir()) !== path.resolve(createUserEnvironment(profile).USERPROFILE)) throw fail("LAUNCH_ENVIRONMENT_MISMATCH");
  let channel;
  if (bindingText) channel = createChildSwitchChannel(JSON.parse(bindingText), profile);
  let runtime;
  try {
    const { createUserRuntime, runUserMode, getUserProfileToken } = await import("./runtime.mjs");
    if (channel && JSON.parse(bindingText).profileToken !== getUserProfileToken(profile)) throw fail("USER_SWITCH_PROFILE_DRIFT");
    runtime = await createUserRuntime(profile, { cwd, switchChannel: channel, initialSessionPath: initialSessionPath || undefined });
    if (channel) process.send(switchEnvelope({ ...JSON.parse(bindingText), originPid: process.pid, profile: profile.id }, "ready"));
    return await runUserMode(runtime, mode, mode === "text" || mode === "json" ? { initialMessage: message } : {});
  } finally {
    if (runtime) await runtime.host.dispose();
    channel?.dispose();
  }
}

function publishedSdkRoot() {
  const candidate = path.join(path.dirname(process.execPath), "node_modules", "@earendil-works", "pi-coding-agent");
  return fs.realpathSync.native(candidate);
}

async function askAccount(users, registryPath) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw fail("ACCOUNT_SELECTION_REQUIRED");
  const lines = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    if (users.length) process.stdout.write(`Accounts: ${users.map(({ id, label }) => `${id} (${label})`).join(", ")}\n`);
    else process.stdout.write("No accounts registered yet.\n");
    const answer = await new Promise((resolve) => {
      let settled = false;
      lines.once("close", () => { if (!settled) { settled = true; resolve(""); } });
      lines.question('Account ID, or "create <id> [label]": ', (value) => { settled = true; resolve(value); });
    });
    const match = /^create\s+([a-z][a-z0-9-]{1,31})(?:\s+(.+))?$/u.exec(answer.trim());
    if (!match) return answer.trim();
    return createAccount({ registryPath, id: match[1], label: match[2] ?? match[1] }).id;
  } finally { lines.close(); }
}

function isNativeEarlyCommand(argv) {
  return argv.some((argument) => ["--version", "-v"].includes(argument)) || argv[0] === "package" || argv[0] === "config";
}

async function createNativeAdapter(options, registryPath, argv) {
  if (options.nativeMain) return { main: options.nativeMain, factory: options.accountRuntimeFactory };
  const packageRoot = options.packageRoot ?? publishedSdkRoot();
  if (isNativeEarlyCommand(argv)) {
    const native = await import(pathToFileURL(path.join(packageRoot, "dist/main.js")).href);
    if (typeof native.main !== "function") throw fail("NATIVE_MAIN_UNAVAILABLE");
    return { main: native.main };
  }
  const stageParent = options.stageParent ?? fs.mkdtempSync(path.join(os.tmpdir(), "pi-account-sdk-"));
  const stageRoot = path.join(stageParent, "prepared-sdk");
  const manifest = await prepareSdkStage({ packageRoot, stageRoot, transforms: {
    "dist/main.js": transformMainSource,
    "dist/migrations.js": transformMigrationsSource,
    "dist/core/model-runtime.js": transformModelRuntimeSource,
    "dist/core/model-config.js": transformModelConfigSource,
  } });
  const mainUrl = pathToFileURL(path.join(stageRoot, "dist/main.js")).href;
  const runtimeUrl = pathToFileURL(path.join(stageRoot, "dist/core/model-runtime.js")).href;
  const mainModule = await import(mainUrl);
  const runtimeModule = await import(runtimeUrl);
  if (typeof mainModule.main !== "function" || !runtimeModule.ModelRuntime) throw fail("NATIVE_SDK_API_UNAVAILABLE");
  const factory = createUserRuntime(registryPath, {
    sdkRoot: packageRoot,
    pickAccount: options.pickAccount ?? ((users) => askAccount(users, registryPath)),
    createModelRuntime: (request) => runtimeModule.ModelRuntime.create({
      ...request,
      allowModelNetwork: request.purpose === "application" && process.env.PI_OFFLINE === undefined,
    }),
  });
  return { main: mainModule.main, factory, manifest };
}

export async function launchUser(argv = process.argv.slice(2), options = {}) {
  const registryPath = options.registryPath ?? defaultRegistryPath(os.homedir());
  const adapter = await createNativeAdapter(options, registryPath, argv);
  return runUserMode(adapter.main, argv, {
    ...(options.nativeOptions ?? {}),
    ...(adapter.factory ? { accountRuntimeFactory: adapter.factory } : {}),
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  launchUser().catch((error) => {
    process.exitCode = 1;
    const code = typeof error?.code === "string" && /^[A-Z][A-Z0-9_]{1,80}$/.test(error.code) ? error.code : "USER_LAUNCH_FAILED";
    process.stderr.write(`${code}\n`);
  });
}
