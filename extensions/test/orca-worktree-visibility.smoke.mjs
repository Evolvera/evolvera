import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

// STATEFUL RESOURCE PROOF: NO_STATEFUL_RESOURCES. Git and Orca are fully injected fakes; no real CLI, filesystem fixture, network, or persistent resource is touched.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const { createJiti } = createRequire(import.meta.url)(path.join(sdkRoot, "node_modules/jiti/lib/jiti.cjs"));
const jiti = createJiti(import.meta.url, { fsCache: false, alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js") } });
const m = await jiti.import(path.join(root, "extensions/orca-worktree-visibility.ts"));

assert.equal(m.isWorktreeAddCommand("git worktree add ../new feature"), true);
assert.equal(m.isWorktreeAddCommand('git -C "C:/repo with spaces" worktree add ../new feature'), true);
assert.equal(m.isWorktreeAddCommand("cd repo && git -C ../main worktree add path branch"), true);
assert.equal(m.isWorktreeAddCommand("git worktree list"), false);
assert.equal(m.isWorktreeAddCommand("git worktree remove ../old"), false);
assert.equal(m.isWorktreeAddCommand("echo git worktree add fake"), false);
assert.equal(m.gitCommandCwd('git -C "C:/repo with spaces" worktree add ../new', "fallback"), "C:/repo with spaces");
assert.equal(m.gitCommandCwd("git worktree add ../new", "fallback"), "fallback");

assert.equal(m.normalizeRepoPath("C:\\Users\\Miguel\\Repo\\", "win32"), "c:/users/miguel/repo");
assert.equal(m.normalizeRepoPath("/Users/Miguel/Repo/", "darwin"), "/Users/Miguel/Repo");
const repos = m.parseRepoList("id-1  Repo name  C:\\Users\\Miguel\\Repo With Spaces\n" +
  "id-2  Another repo  /Users/Miguel/Second Repo\nnot a repo line");
assert.deepEqual(repos, [
  { id: "id-1", name: "Repo name", path: "C:\\Users\\Miguel\\Repo With Spaces" },
  { id: "id-2", name: "Another repo", path: "/Users/Miguel/Second Repo" },
]);

function fixture(run) {
  const handlers = new Map();
  const pi = { on: (name, handler) => handlers.set(name, handler) };
  const ctl = m.registerOrcaWorktreeVisibility(pi, { run, platform: "win32" });
  return { handlers, ctl };
}
const calls = [];
let listCount = 0;
const fakeRun = async (command, args, cwd) => {
  calls.push({ command, args, cwd });
  const joined = `${command} ${args.join(" ")}`;
  if (joined.includes("rev-parse --path-format=absolute --git-common-dir")) return { code: 0, stdout: "C:/Main Repo/.git\n", stderr: "" };
  if (joined.includes("worktree list --porcelain")) return { code: 0, stdout: "worktree C:/Main Repo\n\nworktree C:/new wt\n", stderr: "" };
  if (joined === "orca repo list") return { code: 0, stdout: listCount++ === 0 ? "" : "repo-id  Main Repo  c:\\main repo\n", stderr: "" };
  if (joined.startsWith("orca repo add ")) return { code: 0, stdout: '{"id":"repo-id"}', stderr: "" };
  if (joined.startsWith("orca repo set ")) return { code: 0, stdout: "{}", stderr: "" };
  throw new Error(`unexpected command: ${joined}`);
};
{
  const f = fixture(fakeRun);
  await f.handlers.get("tool_result")({ toolName: "bash", input: { command: "git -C C:/MainRepo worktree add C:/new-wt branch" }, isError: false }, { cwd: "C:/fallback" });
  assert.ok(calls.some((c) => c.command === "git" && c.args.includes("list") && c.args.includes("--porcelain")));
  assert.ok(calls.some((c) => c.command === "orca" && c.args[0] === "repo" && c.args[1] === "add" && m.normalizeRepoPath(c.args[c.args.indexOf("--path") + 1], "win32") === "c:/main repo"));
  assert.ok(calls.some((c) => c.command === "orca" && c.args.includes("show") && c.args.includes("id:repo-id")));
  const before = calls.length;
  await f.handlers.get("tool_result")({ toolName: "bash", input: { command: "git worktree add ../another branch" }, isError: true }, { cwd: "C:/Main Repo" });
  assert.equal(calls.length, before, "failed bash execution does not invoke git/Orca");
}

{
  const startupCalls = [];
  const f = fixture(async (command, args, cwd) => {
    startupCalls.push({ command, args, cwd });
    if (args.at(-1) === "--git-dir") return { code: 0, stdout: "C:/Main Repo/.git/worktrees/linked", stderr: "" };
    if (args.at(-1) === "--git-common-dir") return { code: 0, stdout: "C:/Main Repo/.git", stderr: "" };
    if (args[0] === "rev-parse" && args[1] === "--path-format=absolute" && args[2] === "--git-common-dir") return { code: 0, stdout: "C:/Main Repo/.git", stderr: "" };
    if (args[0] === "worktree") return { code: 0, stdout: "worktree C:/Main Repo\n\nworktree C:/Main Repo/linked\n", stderr: "" };
    if (args[0] === "repo" && args[1] === "list") return { code: 0, stdout: "repo-id  Main Repo  C:/Main Repo\n", stderr: "" };
    if (args[0] === "repo" && args[1] === "set") return { code: 0, stdout: "{}", stderr: "" };
    throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
  });
  await f.handlers.get("session_start")({}, { cwd: "C:/Main Repo/linked" });
  assert.ok(startupCalls.some((c) => c.command === "orca" && c.args.includes("show")), "linked-worktree session enables Orca visibility");
}

console.log("orca-worktree-visibility smoke OK");
