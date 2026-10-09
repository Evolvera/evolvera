import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const PROFILE_MARKER = ".pi-chrome-profile.json";
const SERVER_PREFIX = "chrome_live_";
const DEBUG_HOST = "127.0.0.1";
const START_TIMEOUT_MS = 20_000;

type ManagedChrome = {
  name: string;
  profileDir: string;
  port: number;
  child: ChildProcess;
  serverName: string;
  registration?: { dispose(): Promise<void> };
};

export function normalizeProfileName(value: string): string {
  const name = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(name)) {
    throw new Error("Profile name must be 1-32 lowercase letters, numbers, '_' or '-' and start with a letter or number.");
  }
  return name;
}

export function chromeUserDataDir(): string | undefined {
  const root = process.env.LOCALAPPDATA;
  return root ? join(root, "Google", "Chrome", "User Data") : undefined;
}

export function listRealChromeProfiles(localStatePath = chromeUserDataDir() && join(chromeUserDataDir()!, "Local State")) {
  if (!localStatePath || !existsSync(localStatePath)) return [];
  const state = JSON.parse(readFileSync(localStatePath, "utf8")) as {
    profile?: { info_cache?: Record<string, { name?: unknown }> };
  };
  return Object.entries(state.profile?.info_cache ?? {})
    .filter(([directory, info]) => /^[A-Za-z0-9 _-]+$/.test(directory) && typeof info.name === "string")
    .map(([directory, info]) => ({ directory, name: info.name as string }));
}

export function profilesRoot(home = homedir()): string {
  return join(home, ".pi", "chrome-profiles");
}

export function listPiProfiles(root = profilesRoot()): string[] {
  const piDirectory = dirname(root);
  if (existsSync(piDirectory)) {
    const piDirectoryInfo = lstatSync(piDirectory);
    if (!piDirectoryInfo.isDirectory() || piDirectoryInfo.isSymbolicLink()) throw new Error("Refusing a linked or non-directory ~/.pi parent.");
  }
  if (!existsSync(root)) return [];
  return requireOwnedDirectory(root).filter((name) => {
    const directory = join(root, name);
    try {
      const stat = lstatSync(directory);
      return stat.isDirectory() && !stat.isSymbolicLink() && existsSync(join(directory, PROFILE_MARKER));
    } catch {
      return false;
    }
  }).sort();
}

function requireOwnedDirectory(directory: string): string[] {
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Refusing non-directory or linked path: ${directory}`);
  return readdirSync(directory);
}

export function createPiProfile(nameInput: string, root = profilesRoot()): { name: string; directory: string } {
  const name = normalizeProfileName(nameInput);
  const piDirectory = dirname(root);
  if (existsSync(piDirectory)) {
    const piDirectoryInfo = lstatSync(piDirectory);
    if (!piDirectoryInfo.isDirectory() || piDirectoryInfo.isSymbolicLink()) throw new Error("Refusing a linked or non-directory ~/.pi parent.");
  }
  mkdirSync(root, { recursive: true });
  const rootInfo = lstatSync(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("PI Chrome profile root must be a real directory, not a link.");
  const directory = resolve(root, name);
  if (existsSync(directory)) throw new Error(`Profile already exists; refusing to adopt or overwrite it: ${name}`);
  mkdirSync(directory);
  writeFileSync(join(directory, PROFILE_MARKER), `${JSON.stringify({ owner: "evolvera-pi", version: 1, name })}\n`, { flag: "wx" });
  return { name, directory };
}

function findChromeExecutable(): string {
  const candidates = process.platform === "win32"
    ? [process.env.CHROME_PATH, process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"), process.env["PROGRAMFILES(X86)"] && join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"), process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")]
    : process.platform === "darwin"
      ? [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
      : [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  const found = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!found) throw new Error("Chrome executable not found. Set CHROME_PATH to the installed Chrome binary.");
  return found;
}

async function reserveLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, DEBUG_HOST, () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to allocate a loopback debugging port.");
  const port = address.port;
  await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return port;
}

async function waitForDevTools(port: number, child: ChildProcess, signal?: AbortSignal): Promise<void> {
  let launchError: Error | undefined;
  child.once("error", (error) => { launchError = error; });
  const endpoint = `http://${DEBUG_HOST}:${port}/json/version`;
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error("Chrome startup cancelled.");
    if (launchError) throw launchError;
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Chrome exited during startup (code ${child.exitCode}, signal ${child.signalCode}).`);
    const response = await fetch(endpoint, { signal }).catch(() => undefined);
    if (response?.ok) return;
    await delay(100, undefined, { signal }).catch(() => undefined);
  }
  throw new Error(`Timed out waiting for Chrome's loopback DevTools endpoint at ${endpoint}.`);
}

async function closeChrome(instance: ManagedChrome): Promise<void> {
  try {
    const response = await fetch(`http://${DEBUG_HOST}:${instance.port}/json/version`);
    const version = await response.json() as { webSocketDebuggerUrl?: string };
    if (version.webSocketDebuggerUrl && typeof WebSocket !== "undefined") {
      await new Promise<void>((resolveClose) => {
        const socket = new WebSocket(version.webSocketDebuggerUrl!);
        const timeout = setTimeout(() => { socket.close(); resolveClose(); }, 2_000);
        socket.addEventListener("open", () => socket.send(JSON.stringify({ id: 1, method: "Browser.close" })));
        socket.addEventListener("message", () => { clearTimeout(timeout); socket.close(); resolveClose(); }, { once: true });
        socket.addEventListener("error", () => { clearTimeout(timeout); resolveClose(); }, { once: true });
      });
    }
  } catch { /* The owned process may already be exiting. */ }
  if (instance.child.exitCode === null && instance.child.signalCode === null) {
    const exited = new Promise<void>((resolveExit) => instance.child.once("exit", () => resolveExit()));
    await Promise.race([exited, delay(1_500)]);
  }
  if (instance.child.exitCode === null && instance.child.signalCode === null && instance.child.pid) {
    instance.child.kill(); // Exact child process launched by this extension; never search for or kill other Chrome PIDs.
    await Promise.race([new Promise<void>((resolveExit) => instance.child.once("exit", () => resolveExit())), delay(2_000)]);
  }
}

export default function (pi: ExtensionAPI) {
  const instances = new Map<string, ManagedChrome>();
  let activeName: string | undefined;
  const root = profilesRoot();

  async function stop(name: string) {
    const instance = instances.get(name);
    if (!instance) return;
    instances.delete(name);
    if (activeName === name) activeName = undefined;
    try { await instance.registration?.dispose(); } catch { /* Continue to close the child we own. */ }
    await closeChrome(instance);
  }

  async function start(nameInput: string, headless: boolean, signal?: AbortSignal) {
    const name = normalizeProfileName(nameInput);
    if (!listPiProfiles(root).includes(name)) throw new Error(`Unknown PI-owned Chrome profile '${name}'. Create it first.`);
    const existing = instances.get(name);
    if (existing && existing.child.exitCode === null && existing.child.signalCode === null) {
      activeName = name;
      return { name, port: existing.port, processId: existing.child.pid ?? null, server: existing.serverName, status: "already-running" };
    }
    if (activeName) await stop(activeName);
    const profileDir = join(root, name);
    const port = await reserveLoopbackPort();
    const child = spawn(findChromeExecutable(), [
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${port}`,
      `--remote-debugging-address=${DEBUG_HOST}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-sync",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-extensions",
      "--metrics-recording-only",
      ...(headless ? ["--headless=new"] : ["--start-minimized"]),
      "about:blank",
    ], { windowsHide: true, stdio: "ignore" });
    const instance: ManagedChrome = { name, profileDir, port, child, serverName: `${SERVER_PREFIX}${name}` };
    try {
      await waitForDevTools(port, child, signal);
      const request: {
        version: 1;
        name: string;
        definition: Record<string, unknown>;
        result?: { ok: true; registration: { dispose(): Promise<void> } } | { ok: false; error: Error };
      } = {
        version: 1,
        name: instance.serverName,
        definition: {
          command: "npx",
          args: ["-y", "@playwright/mcp@0.0.83", "--cdp-endpoint", `http://${DEBUG_HOST}:${port}`, "--caps", "vision,devtools", "--snapshot-boxes"],
          cwd: process.cwd(),
          lifecycle: "lazy-keep-alive",
        },
      };
      pi.events.emit("pi-mcp-adapter:runtime-register:v1", request);
      if (!request.result) throw new Error("pi-mcp-adapter runtime registration is unavailable.");
      if (!request.result.ok) throw request.result.error;
      instance.registration = request.result.registration;
      instances.set(name, instance);
      activeName = name;
      return { name, port, processId: child.pid ?? null, server: instance.serverName, status: "started", headless };
    } catch (error) {
      await closeChrome(instance);
      throw error;
    }
  }

  pi.registerTool({
    name: "chrome_profile_manager",
    label: "Chrome Profile Manager",
    description: "List real Chrome profile names read-only; create and switch isolated PI-owned Chrome profiles; start, stop, and report the managed browser status. The real Chrome profiles are never opened or copied.",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("status"), Type.Literal("list"), Type.Literal("create"), Type.Literal("start"), Type.Literal("stop"), Type.Literal("switch")], { description: "Operation to perform" }),
      profile: Type.Optional(Type.String({ description: "PI profile name (1-32 lowercase letters, numbers, '_' or '-')" })),
      headless: Type.Optional(Type.Boolean({ description: "Start the automation browser without a desktop window; defaults to true to avoid taking focus" })),
    }),
    async execute(_id, params, signal) {
      try {
        let result: unknown;
        if (params.action === "list") {
          result = { realChromeProfiles: listRealChromeProfiles(), piProfiles: listPiProfiles(root), active: activeName ?? null };
        } else if (params.action === "create") {
          if (!params.profile) throw new Error("profile is required for create.");
          result = createPiProfile(params.profile, root);
        } else if (params.action === "start" || params.action === "switch") {
          if (!params.profile) throw new Error(`profile is required for ${params.action}.`);
          result = await start(params.profile, params.headless ?? true, signal);
        } else if (params.action === "stop") {
          const name = params.profile ? normalizeProfileName(params.profile) : activeName;
          if (!name) throw new Error("No managed Chrome profile is running.");
          await stop(name);
          result = { name, status: "stopped" };
        } else {
          result = { active: activeName ?? null, profiles: listPiProfiles(root), instances: [...instances.values()].map(({ name, port, child, serverName }) => ({ name, port, processId: child.pid ?? null, server: serverName, status: "running" })) };
        }
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Chrome profile manager failed: ${message}` }], details: { error: message }, isError: true };
      }
    },
  });

  pi.on("session_shutdown", async () => {
    await Promise.all([...instances.keys()].map((name) => stop(name)));
  });
}
