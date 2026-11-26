import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const require = createRequire(import.meta.url);
const { createJiti } = require(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js") } });
const { createConductorEvents } = await jiti.import(path.join(root, "extensions/conductor-events.ts"));
const scratch = await mkdtemp(path.join(os.tmpdir(), "conductor-events-"));
const agentDirectory = path.join(scratch, "agent");
const relayPath = path.join(agentDirectory, "bin", "child-events-relay.py");
const routePath = path.join(agentDirectory, "report-routes.json");
const originalHandle = process.env.ORCA_TERMINAL_HANDLE;
const originalAgentDirectory = process.env.PI_CODING_AGENT_DIR;
const handle = "term_conductor-uuid_123";

try {
  await mkdir(path.dirname(relayPath), { recursive: true });
  await writeFile(relayPath, "pass\n");
  process.env.PI_CODING_AGENT_DIR = agentDirectory;
  let calls = [];
  let launches = [];
  let receipt = { ok: true, result: { runId: "run_concise123" } };
  const runner = async (file, args, options) => {
    calls.push({ file, args, options });
    return { stdout: JSON.stringify(receipt) };
  };
  const spawn = (file, args, options) => {
    const child = Object.assign(new EventEmitter(), { unref: () => { child.unreferenced = true; } });
    launches.push({ file, args, options, child });
    return child;
  };
  const events = createConductorEvents({ runner, spawn, platform: "linux" });

  delete process.env.ORCA_TERMINAL_HANDLE;
  await events.sync(scratch);
  assert.equal(calls.length, 0, "missing own terminal does not query Orca");
  assert.equal(launches.length, 0, "missing own terminal does not launch relay");
  process.env.ORCA_TERMINAL_HANDLE = "term-invalid/selected-ui";
  await events.sync(scratch);
  assert.equal(calls.length, 0, "invalid terminal handle is rejected without lookup");

  process.env.ORCA_TERMINAL_HANDLE = handle;
  receipt = { ok: true, result: { runId: null } };
  await events.sync(scratch);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ["orchestration", "run-current", "--from", handle, "--json"]);
  assert.equal(calls[0].file, "orca");
  assert.equal(calls[0].options.cwd, scratch);
  assert.equal(launches.length, 1, "relay starts with a valid terminal even before a Run is bound");
  assert.deepEqual(launches[0].options, { detached: true, stdio: "ignore" });
  assert.equal(launches[0].file, "python3");
  assert.deepEqual(launches[0].args, [relayPath]);
  assert.equal(launches[0].child.unreferenced, true);
  assert.equal(await readFile(routePath, "utf8").catch(() => ""), "", "no route is written without a proved Run ID");

  receipt = { ok: true, result: { runId: "run_own-123" } };
  await Promise.all([events.sync(scratch), events.sync(scratch)]);
  const routes = JSON.parse(await readFile(routePath, "utf8"));
  assert.equal(routes["run_own-123"], handle, "concise own-run response routes only to the own terminal");
  assert.equal(launches.length, 1, "concurrent and repeated syncs launch only one relay");

  receipt = { ok: true, result: { run: { id: "run_legacy_123" } } };
  await events.sync(scratch);
  assert.equal(JSON.parse(await readFile(routePath, "utf8"))["run_legacy_123"], handle, "full and legacy response shape is accepted");

  const callsBeforeUnrelated = calls.length;
  const launchesBeforeUnrelated = launches.length;
  await events.syncAfterRunCommand({ toolName: "bash", isError: false, input: { command: "echo orca orchestration run-create" } }, scratch);
  await events.syncAfterRunCommand({ toolName: "bash", isError: true, input: { command: "orca orchestration run-use" } }, scratch);
  await events.syncAfterRunCommand({ toolName: "read", isError: false, input: { command: "orca orchestration run-current" } }, scratch);
  assert.equal(calls.length, callsBeforeUnrelated, "failed, non-bash, and non-trigger commands do not sync");

  for (const command of ["orca orchestration run-create --json", "orca-ide orchestration run-use --run run_x", "orca orchestration run-current --json", "orca orchestration worker-start --json"]) {
    await events.syncAfterRunCommand({ toolName: "bash", isError: false, input: { command } }, scratch);
  }
  assert.equal(calls.length, callsBeforeUnrelated + 4, "all successful run-binding commands query authoritative run-current");
  assert.equal(calls.slice(-4).every((call) => call.args[1] === "run-current" && call.args.includes("--from") && call.args.includes(handle)), true);
  assert.equal(launches.length, launchesBeforeUnrelated, "run-triggered sync does not duplicate relay launch");
  launches.at(-1).child.emit("error", new Error("synthetic spawn failure"));
  await events.sync(scratch);
  assert.equal(launches.length, launchesBeforeUnrelated + 1, "a later sync can replace a failed relay launch");

  const nonLinux = createConductorEvents({ runner, spawn, platform: "darwin" });
  const beforeNonLinux = launches.length;
  await nonLinux.sync(scratch);
  assert.equal(launches.length, beforeNonLinux, "relay is Linux-only");
  console.log("conductor-events smoke: PASS (own binding, route registration, command triggers, single relay)");
} finally {
  if (originalHandle === undefined) delete process.env.ORCA_TERMINAL_HANDLE;
  else process.env.ORCA_TERMINAL_HANDLE = originalHandle;
  if (originalAgentDirectory === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalAgentDirectory;
  await rm(scratch, { recursive: true, force: true });
}
