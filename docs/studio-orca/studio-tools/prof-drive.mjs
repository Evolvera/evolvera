import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os"; import path from "node:path";
const S = process.argv[2]; const studio = path.join(S, "studio-dev", "interface");
const temp = mkdtempSync(path.join(os.tmpdir(), "pi-studio-prof-"));
const agent = path.join(temp, "agent"); cpSync(path.join(os.homedir(), ".pi/agent/sessions"), path.join(agent, "sessions"), { recursive: true, preserveTimestamps: true });
const proj = path.join(temp, "projects", "p1"); mkdirSync(proj, { recursive: true }); writeFileSync(path.join(proj, "package.json"), "{}");
const state = path.join(temp, "orca.json"); writeFileSync(state, JSON.stringify({ active: proj, worktrees: [{ path: proj }] }));
const env = { ...process.env, PI_WEB_PORT: "4199", PI_AGENT_DIR: agent, PI_PROJECT_ROOTS: JSON.stringify([path.join(temp, "projects")]),
  PI_STUDIO_ORCA_BIN: process.execPath, PI_STUDIO_ORCA_BIN_ARGS: JSON.stringify([path.join(studio, "test", "fake-orca.mjs")]), FAKE_ORCA_STATE: state, PROF_MS: process.argv[3] || "75000" };
const server = spawn(process.execPath, ["--cpu-prof", `--cpu-prof-dir=${path.join(S, "prof")}`, "prof-run.mjs"], { cwd: studio, env, stdio: "inherit" });
await new Promise((r) => setTimeout(r, 6000));
const edgeBin = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const edge = spawn(edgeBin, ["--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${path.join(temp, "edge")}`, "http://127.0.0.1:4199/"], { stdio: "ignore" });
await new Promise((r) => server.on("exit", r));
spawnSync("powershell.exe", ["-NoProfile", "-Command", `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${path.basename(temp)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`]);
console.log("temp", temp);
