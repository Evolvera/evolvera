import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";
import { pathToFileURL } from "node:url";
import { createSandbox, createAccessGuard, denyNetwork } from "./lib/users-sandbox.mjs";
import { registerUser } from "../users/registry.mjs";
import { assertOwnedWorkspace } from "../users/ownership.mjs";
import { admitUserResources, buildAdmittedLoaderOptions } from "../users/resources.mjs";

const SDK = "C:/nvm4w/nodejs/node_modules/@earendil-works/pi-coding-agent/dist/core";
const sandbox = createSandbox("users-resources");
const protectedGuard = createAccessGuard(fs, ["C:/Users/kevin/.pi/agent", "C:/Users/kevin/Documents/Pi/.pi"]);
const networkGuard = denyNetwork(net);
const priorEnv = { ...process.env };
try {
  for (const [key, value] of Object.entries(sandbox.env)) process.env[key] = value;
  sandbox.mkdir("home", ".agents", "skills");
  const agentDir = sandbox.mkdir("profiles", "kevin", "agent");
  const sessionRoot = sandbox.mkdir("profiles", "kevin", "sessions");
  const workspace = sandbox.mkdir("workspaces", "repo");
  sandbox.mkdir("workspaces", "repo", ".git");
  const detached = sandbox.mkdir("detached", "allowed-tree");
  const nested = sandbox.mkdir("detached", "allowed-tree", "subdir");
  const gitdir = sandbox.mkdir("workspaces", "repo", ".git", "worktrees", "smoke");
  const detachedGit = path.join(detached, ".git");
  sandbox.write(detachedGit, `gitdir: ${gitdir}\n`);
  sandbox.write(path.join(gitdir, "commondir"), "../..\n");
  sandbox.write(path.join(gitdir, "gitdir"), `${detachedGit.replaceAll("\\", "/")}\n`);
  const profile = registerUser({ registryPath: path.join(sandbox.root, "registry", "users.json"), id: "kevin", label: "Kevin synthetic", agentDir, sessionRoots: [sessionRoot], workspaces: [workspace], sharedAssets: [sandbox.mkdir("shared")], contexts: [] });
  const allowedExtension = path.join(detached, "allowed.mjs");
  const blockedExtension = path.join(sandbox.root, "alien", "blocked.mjs");
  const contextFile = path.join(detached, "AGENTS.md");
  sandbox.write(contextFile, "synthetic admitted context\n");
  sandbox.write(allowedExtension, "export default function () { globalThis.__usersAllowedFactory++; }\n");
  sandbox.write(blockedExtension, "export default function () { globalThis.__usersBlockedFactory++; }\n");
  const credentialSentinel = path.join(agentDir, "auth.json");
  sandbox.write(credentialSentinel, JSON.stringify({ token: "FAKE-SECRET-no-read" }));
  const fakeMcpStore = path.join(sandbox.root, "fake-mcp-store.json");
  sandbox.write(fakeMcpStore, JSON.stringify({ url: "https://fake-user:FAKE-SECRET-mcp@invalid.example" }));
  protectedGuard.protect(credentialSentinel);
  protectedGuard.protect(fakeMcpStore);
  const cwd = nested;
  const admitted = buildAdmittedLoaderOptions(profile, {
    cwd,
    settings: { extensions: [allowedExtension, blockedExtension, "builtin:mcp"], packages: ["pi-mcp-adapter@https://fake-user:FAKE-SECRET-package@invalid.example"] },
    projectSettings: { extensions: [allowedExtension] },
    cliPaths: { extensions: [allowedExtension, blockedExtension] },
    contextPaths: [contextFile],
  });
  assert.equal(admitted.cwd, cwd);
  assert.equal(admitted.agentDir, agentDir);
  assert.equal(admitted.noContextFiles, true, "unadmitted ancestors disable public ancestor context scanning");
  assert.deepEqual(admitted.additionalExtensionPaths, [allowedExtension]);
  assert.deepEqual(admitted.projectSettings.extensions, [allowedExtension]);
  assert.deepEqual(admitted.settings.extensions, [allowedExtension, allowedExtension]);
  assert.deepEqual(admitted.settings.packages, []);
  assert.equal(admitted.diagnostics.filter((item) => item.code === "MCP_BLOCKED").length >= 2, true);
  assert.equal(admitted.diagnostics.some((item) => item.code === "MCP_BLOCKED"), true);
  assert.doesNotMatch(JSON.stringify(admitted.diagnostics), /FAKE-SECRET|fake-user|invalid\.example/);
  const effective = assertOwnedWorkspace(profile, cwd);
  assert.equal(effective.workspaceRoot, detached);
  assert.equal(effective.worktreeOrigin, workspace);
  const derived = admitUserResources(profile, { cwd, cliPaths: { extensions: [allowedExtension] } });
  assert.deepEqual(derived.cliPaths.extensions, [allowedExtension]);

  let forgedConstruction = false;
  assert.throws(() => {
    const options = buildAdmittedLoaderOptions(profile, { cwd: path.join(sandbox.root, "forged"), settings: {} });
    forgedConstruction = true;
    return options;
  }, /WORKSPACE|WORKTREE|OWNED/);
  assert.equal(forgedConstruction, false, "forged cwd must reject before loader construction");
  const forged = sandbox.mkdir("detached", "forged");
  sandbox.write(path.join(forged, ".git"), `gitdir: ${gitdir}\n`);
  assert.throws(() => buildAdmittedLoaderOptions(profile, { cwd: forged }), /WORKTREE_ORIGIN_UNDECIDABLE/);

  protectedGuard.install();
  syncBuiltinESMExports();
  const [{ DefaultResourceLoader }, { SettingsManager }] = await Promise.all([
    import(pathToFileURL(path.join(SDK, "resource-loader.js")).href),
    import(pathToFileURL(path.join(SDK, "settings-manager.js")).href),
  ]);
  const settingsManager = SettingsManager.inMemory(admitted.settings, { projectTrusted: true });
  const loaderOptions = {
    cwd: admitted.cwd,
    agentDir: admitted.agentDir,
    settingsManager,
    additionalExtensionPaths: admitted.additionalExtensionPaths,
    additionalSkillPaths: admitted.additionalSkillPaths,
    additionalPromptTemplatePaths: admitted.additionalPromptTemplatePaths,
    additionalThemePaths: admitted.additionalThemePaths,
    noContextFiles: admitted.noContextFiles,
    agentsFilesOverride: admitted.agentsFilesOverride,
  };
  // Every file-backed loader root and resource input is a descendant of this run's mkdtemp.
  for (const key of ["cwd", "agentDir", ...Object.keys(loaderOptions).filter((name) => name.startsWith("additional"))]) {
    const value = loaderOptions[key];
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === "string" && path.isAbsolute(item)) assert.ok(item === sandbox.root || item.startsWith(`${sandbox.root}${path.sep}`), `loader input escaped sandbox: ${key}`);
    }
  }
  globalThis.__usersAllowedFactory = 0;
  globalThis.__usersBlockedFactory = 0;
  const loader = new DefaultResourceLoader(loaderOptions);
  await loader.reload();
  assert.equal(globalThis.__usersAllowedFactory, 1, "admitted local extension factory executed");
  assert.equal(globalThis.__usersBlockedFactory, 0, "inadmissible extension factory never executed");
  assert.deepEqual(loader.getAgentsFiles().agentsFiles.map(({ path: file, content }) => ({ path: file, content })), [{ path: contextFile, content: "synthetic admitted context\n" }]);
  assert.equal(protectedGuard.count, 0, "no host settings/auth/model/MCP store access");
  assert.equal(networkGuard.attempts, 0, "no sockets opened");
  assert.doesNotMatch(JSON.stringify(admitted), /FAKE-SECRET|fake-user|invalid\.example/);
  console.log("users-resources smoke passed; admitted factory=1; blocked factory=0; derived worktree admitted; forged paths rejected pre-construction; Kevin MCP blocked; host-store accesses=0; network attempts=0; no secrets echoed.");
} finally {
  protectedGuard.restore();
  syncBuiltinESMExports();
  networkGuard.restore();
  for (const key of Object.keys(process.env)) if (!(key in priorEnv)) delete process.env[key];
  for (const [key, value] of Object.entries(priorEnv)) process.env[key] = value;
  delete globalThis.__usersAllowedFactory;
  delete globalThis.__usersBlockedFactory;
  const cleaned = sandbox.cleanup();
  assert.equal(cleaned, true, "run-owned sandbox cleaned");
}
