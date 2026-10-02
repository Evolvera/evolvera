import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

export const PACKAGE_NAME = "@tintinweb/pi-subagents";
export const PACKAGE_VERSION = "0.18.2";
export const ENTRY_RELATIVE = path.join("src", "index.ts");
const MODULES = ["src/agent-runner.ts", "src/agent-manager.ts", "src/index.ts", "src/memory.ts", "src/output-file.ts", "src/schedule-store.ts"];
const KEY = 'Symbol.for("pi.users.context")';
const FINAL_DIR = "pi-subagents-0.18.2-users";
const fail = (message) => { throw new Error(`Subagents compatibility staging refused: ${message}`); };
const within = (parent, child) => { const rel = path.relative(parent, child); return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)); };
function canonical(p, label) {
  if (typeof p !== "string" || !path.isAbsolute(p) || p.includes("\0")) fail(`${label} must be an explicit absolute path`);
  let real;
  try { real = fs.realpathSync.native(path.resolve(p)); } catch { fail(`${label} must exist and resolve`); }
  if (path.resolve(p) !== real) fail(`${label} must be canonical`);
  return real;
}
function one(text, anchor, replacement, label) {
  const i = text.indexOf(anchor);
  if (i < 0 || text.indexOf(anchor, i + anchor.length) !== -1) fail(`anchor mismatch: ${label}`);
  return text.slice(0, i) + replacement + text.slice(i + anchor.length);
}
const RECEIPT = `import * as usersPath from "node:path";
const USERS_CONTEXT_KEY = ${KEY};
const usersMarker = process.env.PI_USER_ID;
const usersDescriptor = Object.getOwnPropertyDescriptor(globalThis, USERS_CONTEXT_KEY);
const usersManaged = usersMarker !== undefined || usersDescriptor !== undefined;
let usersContext;
if (usersManaged) {
  if (!usersDescriptor || !("value" in usersDescriptor) || usersDescriptor.configurable || usersDescriptor.writable) throw new Error("Managed pi-subagents requires a valid matching users receipt");
  usersContext = usersDescriptor.value;
  const profile = usersContext?.profile;
  const runtime = usersContext?.modelRuntime;
  if (!usersContext || typeof usersContext !== "object" || !Object.isFrozen(usersContext) ||
      !profile || typeof profile !== "object" || !Object.isFrozen(profile) ||
      typeof profile.id !== "string" || profile.id.length === 0 ||
      typeof profile.agentDir !== "string" || !usersPath.isAbsolute(profile.agentDir) || profile.agentDir.includes("\\0") ||
      (usersMarker !== undefined && usersMarker !== profile.id) ||
      typeof usersContext.assertOwnedWorkspace !== "function" || typeof usersContext.assertOwnedSession !== "function" ||
      typeof usersContext.admitUserResources !== "function" || runtime == null ||
      (typeof runtime !== "object" && typeof runtime !== "function")) throw new Error("Managed pi-subagents requires a valid matching users receipt");
}
function usersWorkspace(cwd) {
  if (!usersManaged) return undefined;
  const owned = usersContext.assertOwnedWorkspace(cwd);
  if (!owned || owned.userId !== usersContext.profile.id || typeof owned.workspaceRoot !== "string" || !usersPath.isAbsolute(owned.workspaceRoot)) throw new Error("Managed pi-subagents workspace ownership is unavailable");
  usersContext.admitUserResources({ resource: "pi-subagents-workspace", userId: usersContext.profile.id, cwd: owned.cwd, root: owned.workspaceRoot, worktreeOrigin: owned.worktreeOrigin });
  return owned;
}
function usersSession(sessionPath, cwd) {
  if (!usersManaged) return;
  usersContext.assertOwnedSession({ sessionPath, cwd });
  usersContext.admitUserResources({ resource: "pi-subagents-session", userId: usersContext.profile.id, sessionPath, cwd });
}
`;

function adaptRunner(s) {
  if (!s.includes('import { basename, dirname, isAbsolute, join, resolve } from "node:path";')) fail("runner path import anchor mismatch");
  s = one(s, 'const configCwd = options.configCwd ?? effectiveCwd;\n\n  const env = await detectEnv(options.pi, effectiveCwd);',
    `const configCwd = options.configCwd ?? effectiveCwd;
  const effectiveOwnership = usersWorkspace(effectiveCwd);
  const configOwnership = usersWorkspace(configCwd);
  if (usersManaged && effectiveOwnership.userId !== configOwnership.userId) throw new Error("Managed pi-subagents cwd/config ownership mismatch");
  if (options.resumeSessionFile) usersSession(options.resumeSessionFile, effectiveCwd);
  if (usersManaged) usersContext.admitUserResources({ resource: "pi-subagents-agent-root", root: usersContext.profile.agentDir, userId: usersContext.profile.id });

  const env = await detectEnv(options.pi, effectiveCwd);`, "pre-ingestion runner guard");
  s = one(s, 'const agentDir = getAgentDir();', 'const agentDir = usersManaged ? usersContext.profile.agentDir : getAgentDir();', "managed agent root");
  s = one(s, 'const defaultSessionDir = process.env.PI_CODING_AGENT_SESSION_DIR ?? settingsManager.getSessionDir?.();',
    'const defaultSessionDir = process.env.PI_CODING_AGENT_SESSION_DIR ?? settingsManager.getSessionDir?.();\n  if (usersManaged) usersContext.admitUserResources({ resource: "pi-subagents-session-directory", userId: usersContext.profile.id, cwd: effectiveCwd, workspaceRoot: effectiveOwnership.workspaceRoot, sessionDir: configuredSessionDir ?? defaultSessionDir });', "session directory pre-admission");
  s = one(s, 'const parentModelRuntime = (ctx.modelRegistry as unknown as { runtime?: unknown }).runtime;',
    'const parentModelRuntime = usersManaged ? usersContext.modelRuntime : (ctx.modelRegistry as unknown as { runtime?: unknown }).runtime;', "parent model runtime");
  s = one(s, '...(parentModelRuntime !== undefined && { modelRuntime: parentModelRuntime as never }),',
    '...(parentModelRuntime !== undefined && { modelRuntime: parentModelRuntime as never }),', "session runtime anchor");
  return s;
}
function adaptManager(s) {
  s = one(s, 'const baseCwd = customCwd ?? ctx.cwd;\n\n    // Worktree isolation:',
    `const baseCwd = customCwd ?? ctx.cwd;
    usersWorkspace(baseCwd);

    // Worktree isolation:`, "pre-worktree base guard");
  s = one(s, '      worktreeCwd = customCwd !== undefined ? wt.workPath : wt.path;\n      this.worktreeRepos.add(baseCwd);',
    `      worktreeCwd = customCwd !== undefined ? wt.workPath : wt.path;
      usersWorkspace(worktreeCwd);
      this.worktreeRepos.add(baseCwd);`, "derived external worktree guard");
  return s;
}
function adaptIndex(s) {
  s = one(s, 'export default function (pi: ExtensionAPI) {',
    `export default function (pi: ExtensionAPI) {
  if (usersManaged) {
    usersWorkspace(process.cwd());
    usersContext.admitUserResources({ resource: "pi-subagents-global-config", userId: usersContext.profile.id, root: usersContext.profile.agentDir });
    if (getAgentDir() !== usersContext.profile.agentDir) throw new Error("Managed pi-subagents SDK agentDir does not match the users profile");
  }`, "entry receipt and guarded SDK profile root");
  s = one(s, 'const path = resolveStorePath(ctx.cwd, sessionId);\n      const store = new ScheduleStore(path);',
    `const owned = usersWorkspace(ctx.cwd);
      const path = resolveStorePath(ctx.cwd, sessionId);
      if (usersManaged) usersContext.admitUserResources({ resource: "pi-subagents-schedules", userId: usersContext.profile.id, cwd: owned.cwd, root: owned.workspaceRoot, path });
      const store = new ScheduleStore(path);`, "scheduled store guard");
  s = one(s, 'existing.outputFile = createOutputFilePath(ctx.cwd, id, ctx.sessionManager.getSessionId());',
    'existing.outputFile = createOutputFilePath(ctx.cwd, id, ctx.sessionManager.getSessionId());', "resume transcript anchor");
  return s;
}
function adaptMemory(s) {
  s = one(s, 'const current = join(getAgentDir(), "agent-memory", agentName);',
    'const current = join(usersManaged ? usersContext.profile.agentDir : getAgentDir(), "agent-memory", agentName);', "profile memory root");
  s = one(s, 'const legacy = join(homedir(), ".pi", "agent-memory", agentName);',
    'const legacy = usersManaged ? join(usersPath.dirname(usersContext.profile.agentDir), "agent-memory", agentName) : join(homedir(), ".pi", "agent-memory", agentName);', "legacy memory ownership");
  s = one(s, 'if (!existsSync(current) && existsSync(legacy) && !isSymlink(legacy)) {',
    'if (!existsSync(current) && (!usersManaged || usersContext.profile.id === "evolvera") && existsSync(legacy) && !isSymlink(legacy)) {', "legacy memory adoption policy");
  s = one(s, '  const memoryDir = resolveMemoryDir(agentName, scope, cwd);\n  // Create the memory directory',
    `  if (usersManaged) usersWorkspace(cwd);
  const memoryDir = resolveMemoryDir(agentName, scope, cwd);
  if (usersManaged) usersContext.admitUserResources({ resource: "pi-subagents-memory", userId: usersContext.profile.id, root: memoryDir, cwd });
  // Create the memory directory`, "memory pre-read/write admission");
  s = one(s, '  const memoryDir = resolveMemoryDir(agentName, scope, cwd);\n  const existingMemory = readMemoryIndex(memoryDir);',
    `  if (usersManaged) usersWorkspace(cwd);
  const memoryDir = resolveMemoryDir(agentName, scope, cwd);
  if (usersManaged) usersContext.admitUserResources({ resource: "pi-subagents-memory", userId: usersContext.profile.id, root: memoryDir, cwd });
  const existingMemory = readMemoryIndex(memoryDir);`, "readonly memory pre-read admission");
  return s;
}
function adaptOutput(s) {
  s = one(s, '  const encoded = encodeCwd(cwd);\n  const root = join(tmpdir(), `pi-subagents-${process.getuid?.() ?? 0}`);',
    `  const owned = usersManaged ? usersWorkspace(cwd) : undefined;
  const encoded = encodeCwd(cwd);
  const root = usersManaged ? join(owned.workspaceRoot, ".pi", "subagent-output") : join(tmpdir(), \`pi-subagents-\${process.getuid?.() ?? 0}\`);
  if (usersManaged) usersContext.admitUserResources({ resource: "pi-subagents-transcript", userId: usersContext.profile.id, cwd: owned.cwd, root, sessionId });`, "managed transcript root");
  return s;
}
function adaptScheduleStore(s) {
  s = one(s, '  return join(cwd, ".pi", "subagent-schedules", `${sessionId}.json`);',
    `  if (usersManaged) {
    const owned = usersWorkspace(cwd);
    const file = join(owned.workspaceRoot, ".pi", "subagent-schedules", \`\${sessionId}.json\`);
    usersContext.admitUserResources({ resource: "pi-subagents-schedules", userId: usersContext.profile.id, cwd: owned.cwd, root: owned.workspaceRoot, sessionId, path: file });
    return file;
  }
  return join(cwd, ".pi", "subagent-schedules", \`\${sessionId}.json\`);`, "managed schedule path");
  return s;
}
function transform(name, source) {
  let output;
  switch (name) {
    case "src/index.ts": output = adaptIndex(source); break;
    case "src/agent-runner.ts": output = adaptRunner(source); break;
    case "src/agent-manager.ts": output = adaptManager(source); break;
    case "src/memory.ts": output = adaptMemory(source); break;
    case "src/output-file.ts": output = adaptOutput(source); break;
    case "src/schedule-store.ts": output = adaptScheduleStore(source); break;
    default: fail(`undeclared module ${name}`);
  }
  return `${RECEIPT}\n${output}`;
}

/** Stage a verified 0.18.2 copy with users guards; the installed package is never modified. */
export function stageSubagentsProfileCompatibility(sourceRoot, stagingRoot, profileContext) {
  const source = canonical(sourceRoot, "sourceRoot");
  const destination = canonical(stagingRoot, "stagingRoot");
  if (within(source, destination) || within(destination, source)) fail("sourceRoot and stagingRoot must be disjoint");
  const profile = profileContext?.profile ?? profileContext;
  if (!profile || typeof profile.id !== "string" || profile.id.length === 0 || typeof profile.agentDir !== "string" || !path.isAbsolute(profile.agentDir) || profile.agentDir.includes("\0")) fail("profileContext must identify a profile with an absolute agentDir");
  if (!fs.statSync(destination).isDirectory()) fail("stagingRoot must be a directory");
  const metadata = JSON.parse(fs.readFileSync(path.join(source, "package.json"), "utf8"));
  if (metadata.name !== PACKAGE_NAME || metadata.version !== PACKAGE_VERSION || JSON.stringify(metadata.pi?.extensions) !== JSON.stringify(["./src/index.ts"])) fail("package identity, version, or entry mismatch");
  for (const relative of MODULES) {
    const stat = fs.lstatSync(path.join(source, relative));
    if (!stat.isFile() || stat.isSymbolicLink()) fail(`module must be a regular source file: ${relative}`);
  }
  const finalRoot = path.join(destination, FINAL_DIR);
  if (fs.existsSync(finalRoot)) fail("staging destination already exists");
  const temporary = path.join(destination, `.${FINAL_DIR}-${process.pid}-${randomBytes(8).toString("hex")}.tmp`);
  try {
    fs.mkdirSync(temporary);
    fs.cpSync(source, temporary, { recursive: true, dereference: false, filter: (p) => !path.relative(source, p).split(path.sep).some((part) => ["node_modules", ".git", "dist"].includes(part)) });
    for (const relative of MODULES) {
      const file = path.join(temporary, relative);
      const sourceText = fs.readFileSync(path.join(source, relative), "utf8");
      fs.writeFileSync(file, transform(relative, sourceText), { flag: "w" });
    }
    fs.renameSync(temporary, finalRoot);
  } catch (error) {
    try { fs.rmSync(temporary, { recursive: true, force: true }); } catch { /* only this unique temporary staging tree */ }
    throw error;
  }
  return Object.freeze({ packageRoot: finalRoot, entry: path.join(finalRoot, ENTRY_RELATIVE) });
}
