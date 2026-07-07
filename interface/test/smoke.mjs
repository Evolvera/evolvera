import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const fakePi = path.join(__dirname, "fake-pi-rpc.mjs");

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for server. Output:\n${output}`)), 6000);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString("utf8");
    });
    child.on("exit", (code) => reject(new Error(`Server exited early with code ${code}. Output:\n${output}`)));
  });
}

async function post(base, pathname, body) {
  const res = await fetch(`${base}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${pathname}: ${data.error || res.status}`);
  return data;
}

function collectSse(base, eventsPath, onEvent) {
  const req = http.get(`${base}${eventsPath}`, (res) => {
    res.setEncoding("utf8");
    let buffer = "";
    res.on("data", (chunk) => {
      buffer += chunk;
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const eventLine = frame.split("\n").find((line) => line.startsWith("event: "));
        const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
        if (eventLine && dataLine) {
          onEvent(eventLine.slice(7), JSON.parse(dataLine.slice(6)));
        }
        boundary = buffer.indexOf("\n\n");
      }
    });
  });
  return req;
}

async function waitFor(predicate, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error("Timed out waiting for expected event");
}

const child = spawn(process.execPath, [path.join(root, "server.mjs")], {
  cwd: root,
  env: {
    ...process.env,
    PI_WEB_PORT: "0",
    PI_PROJECT_ROOTS: root,
    PI_WEB_PI_BIN: process.execPath,
    PI_WEB_PI_BIN_ARGS: JSON.stringify([fakePi]),
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let sse;
try {
  const port = await waitForServer(child);
  const base = `http://127.0.0.1:${port}`;
  const health = await (await fetch(`${base}/api/health`)).json();
  if (!health.ok) throw new Error("health check failed");

  const agents = await (await fetch(`${base}/api/agents`)).json();
  if (!Array.isArray(agents.agents)) throw new Error("agents endpoint did not return an array");

  const bootstrap = await (await fetch(`${base}/api/bootstrap`)).json();
  if (!Array.isArray(bootstrap.projects) || bootstrap.projects.length === 0) throw new Error("bootstrap did not discover projects");
  const projectId = bootstrap.projects[0].id;
  const opened = await post(base, `/api/projects/${projectId}/open`, {});
  if (!opened.session?.id) throw new Error("project open did not start a session");

  const seen = [];
  sse = collectSse(base, `/api/projects/${projectId}/events`, (event, payload) => seen.push({ event, payload }));

  await post(base, `/api/projects/${projectId}/command`, { id: "smoke-1", type: "prompt", message: "hello" });
  await waitFor(() => seen.some((item) => item.event === "rpc" && item.payload.type === "message_update"));
  await waitFor(() => seen.some((item) => item.event === "rpc" && item.payload.type === "agent_end"));

  await post(base, `/api/projects/${projectId}/command`, { id: "state-1", type: "get_state" });
  await waitFor(() => seen.some((item) => item.payload?.type === "response" && item.payload.command === "get_state"));

  await post(base, `/api/projects/${projectId}/stop`, {});
  console.log("smoke ok");
} finally {
  if (sse) sse.destroy();
  child.kill("SIGTERM");
}
