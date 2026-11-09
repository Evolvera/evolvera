#!/usr/bin/env node
/**
 * Obscura capture backend.
 *
 * Obscura's CLI (`fetch -s`) and its MCP `browser_screenshot` capture the
 * viewport only, so full-page parity with the Chromium backend requires CDP:
 * `Page.captureScreenshot` with `captureBeyondViewport`.
 *
 * The CDP client below is intentionally dependency-free (Node's global
 * WebSocket) because the harness must not add an npm package just to take two
 * screenshots.
 */
import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import net from "node:net";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_TIMEOUT_MS = 60_000;

/** Locate the Obscura binary: explicit override, PATH, then the harness bin dir. */
export function resolveObscura(env = process.env, pathValue = env.PATH ?? "", homeDir = env.HOME) {
  const isFile = (candidate) => {
    try {
      return statSync(candidate).isFile();
    } catch {
      return false;
    }
  };
  if (env.PI_OBSCURA_BIN) return env.PI_OBSCURA_BIN;
  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, "obscura");
    if (isFile(candidate)) return candidate;
  }
  if (homeDir) {
    const fallback = path.join(homeDir, ".pi", "agent", "bin", "obscura");
    if (isFile(fallback)) return fallback;
  }
  return undefined;
}

export async function findFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForCdp(baseUrl, deadline, getSpawnError) {
  let lastError;
  while (Date.now() < deadline) {
    const spawnError = getSpawnError?.();
    if (spawnError) throw new Error(`Obscura binary could not be started: ${spawnError.message}`);
    try {
      const response = await fetch(`${baseUrl}/json/version`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return await response.json();
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Obscura CDP endpoint did not become ready: ${lastError?.message ?? "timeout"}`);
}

function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  const listeners = new Set();
  let nextId = 0;

  const ready = new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error("Obscura CDP socket failed to open"));
  });

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
      return;
    }
    for (const listener of listeners) listener(message);
  };

  return {
    ready,
    send(method, params = {}, sessionId) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    once(method, sessionId) {
      return new Promise((resolve) => {
        const listener = (message) => {
          if (message.method === method && message.sessionId === sessionId) {
            listeners.delete(listener);
            resolve();
          }
        };
        listeners.add(listener);
      });
    },
    close() {
      try {
        socket.close();
      } catch {
        // Socket already gone.
      }
    },
  };
}

/**
 * Capture every requested shot as a full-page PNG.
 *
 * @param {{ obscuraPath: string, pageUrl: string, shots: Array<{name: string, width: number, height: number, file: string}>, timeoutMs?: number }} options
 * @returns {Promise<{ engine: "obscura", version: string | undefined }>}
 */
export async function captureWithObscura({ obscuraPath, pageUrl, shots, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(
    obscuraPath,
    ["serve", "--port", String(port), "--allow-file-access", "--allow-private-network"],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  let spawnError;
  server.stderr?.on("data", (chunk) => {
    if (stderr.length < 4000) stderr += chunk.toString();
  });
  server.on("error", (error) => {
    spawnError = error;
  });
  const exited = new Promise((resolve) => server.once("exit", resolve));

  const deadline = Date.now() + timeoutMs;
  let client;
  try {
    const version = await waitForCdp(baseUrl, deadline, () => spawnError);
    if (server.exitCode !== null) throw new Error(`Obscura exited early: ${stderr.trim() || server.exitCode}`);
    client = createCdpClient(version.webSocketDebuggerUrl);
    await client.ready;

    for (const shot of shots) {
      const { targetId } = await client.send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await client.send("Target.attachToTarget", { targetId, flatten: true });
      try {
        await client.send("Page.enable", {}, sessionId);
        await client.send(
          "Emulation.setDeviceMetricsOverride",
          { width: shot.width, height: shot.height, deviceScaleFactor: 1, mobile: false },
          sessionId,
        );
        const loaded = client.once("Page.loadEventFired", sessionId);
        await client.send("Page.navigate", { url: pageUrl }, sessionId);
        await loaded;
        const { data } = await client.send(
          "Page.captureScreenshot",
          { format: "png", captureBeyondViewport: true },
          sessionId,
        );
        await fs.mkdir(path.dirname(shot.file), { recursive: true });
        await fs.writeFile(shot.file, Buffer.from(data, "base64"));
      } finally {
        await client.send("Target.closeTarget", { targetId }).catch(() => {});
      }
    }
    return { engine: "obscura", version: version.Browser };
  } finally {
    client?.close();
    if (server.exitCode === null && !spawnError) {
      server.kill("SIGTERM");
      // Give the engine a moment to reap workers before the caller proceeds.
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
      if (server.exitCode === null) server.kill("SIGKILL");
    }
  }
}