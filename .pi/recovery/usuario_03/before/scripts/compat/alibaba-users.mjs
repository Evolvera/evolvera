import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

export const PACKAGE_NAME = "pi-alibaba-models";
export const PACKAGE_VERSION = "1.0.14";
export const ENTRY_RELATIVE = path.join("extensions", "alibaba.ts");
const ENTRY = "extensions/alibaba.ts";
const PACKAGE_RELATIVE = "package.json";
const FINAL_DIR = `${PACKAGE_NAME}-${PACKAGE_VERSION}`;

const fail = (message) => { throw new Error(`Alibaba compatibility staging refused: ${message}`); };
const within = (parent, child) => {
  const rel = path.relative(parent, child);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
};
function canonical(p, label) {
  if (typeof p !== "string" || !path.isAbsolute(p) || p.includes("\0")) fail(`${label} must be an explicit absolute path`);
  let resolved;
  try { resolved = fs.realpathSync.native(path.resolve(p)); } catch { fail(`${label} must exist and resolve`); }
  if (path.resolve(p) !== resolved) fail(`${label} must be canonical (no alias/junction)`);
  return resolved;
}
function one(source, anchor, replacement, label) {
  const first = source.indexOf(anchor);
  if (first < 0 || source.indexOf(anchor, first + anchor.length) !== -1) fail(`anchor mismatch: ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + anchor.length);
}
function adapt(source) {
  let output = source;
  output = one(output,
    'const HOME_DIR = path.join(os.homedir(), ".pi", "agent");',
    'const USERS_CONTEXT_KEY = Symbol.for("pi.users.context");\nconst usersContext = globalThis[USERS_CONTEXT_KEY];\nconst userMarker = process.env.PI_USER_ID;\nconst managedUser = userMarker !== undefined || usersContext !== undefined;\nif (managedUser) {\n  const descriptor = Object.getOwnPropertyDescriptor(globalThis, USERS_CONTEXT_KEY);\n  const profile = usersContext?.profile;\n  if (!descriptor || descriptor.value !== usersContext || descriptor.writable !== false || descriptor.configurable !== false ||\n      !Object.isFrozen(usersContext) || !Object.isFrozen(profile) ||\n      typeof profile?.id !== "string" || typeof profile?.agentDir !== "string" || !path.isAbsolute(profile.agentDir) ||\n      (userMarker !== undefined && userMarker !== profile.id) ||\n      typeof usersContext.assertOwnedWorkspace !== "function" || typeof usersContext.assertOwnedSession !== "function" ||\n      typeof usersContext.admitUserResources !== "function" || !("modelRuntime" in usersContext)) {\n    throw new Error("Managed Alibaba startup requires a valid matching users receipt");\n  }\n}\nconst HOME_DIR = managedUser ? usersContext.profile.agentDir : path.join(os.homedir(), ".pi", "agent");',
    "profile-root anchor");
  output = one(output, '  return process.env.DASHSCOPE_API_KEY || null;', '  return managedUser ? null : (process.env.DASHSCOPE_API_KEY || null);', "cloud env fallback");
  output = one(output, '  migrateLegacyAuth();', '  if (!managedUser) migrateLegacyAuth();', "legacy migration guard");
  const apiKeyAnchor = /^(\s*)apiKey: "\$DASHSCOPE_API_KEY",$/gm;
  const apiKeyMatches = [...output.matchAll(apiKeyAnchor)];
  if (apiKeyMatches.length !== 2) fail("anchor mismatch: cloud registration cardinality");
  output = output.replace(apiKeyAnchor, '$1apiKey: managedUser ? undefined : "$DASHSCOPE_API_KEY",');
  return output;
}

/** Copy the verified Alibaba 1.0.14 entry and minimal package metadata to a caller-owned root. */
export function stageAlibabaProfileCompatibility(sourceRoot, stagingRoot, profileContext) {
  const source = canonical(sourceRoot, "sourceRoot");
  const destination = canonical(stagingRoot, "stagingRoot");
  if (within(source, destination) || within(destination, source)) fail("sourceRoot and stagingRoot must be disjoint");
  const profile = profileContext?.profile ?? profileContext;
  if (!profile || typeof profile.id !== "string" || typeof profile.agentDir !== "string" || !path.isAbsolute(profile.agentDir)) {
    fail("profileContext must identify an explicit absolute profile agentDir");
  }
  const destinationStat = fs.statSync(destination);
  if (!destinationStat.isDirectory()) fail("stagingRoot must be a directory");
  const packagePath = path.join(source, PACKAGE_RELATIVE);
  const entryPath = path.join(source, ENTRY_RELATIVE);
  const metadata = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  if (metadata.name !== PACKAGE_NAME || metadata.version !== PACKAGE_VERSION ||
      JSON.stringify(metadata.pi?.extensions) !== JSON.stringify([ENTRY])) fail("package identity, version, or entry mismatch");
  const entryStat = fs.lstatSync(entryPath);
  if (!entryStat.isFile() || entryStat.isSymbolicLink()) fail("entry must be a regular source file");
  const sourceText = fs.readFileSync(entryPath, "utf8");
  const compatibleText = adapt(sourceText);
  const finalRoot = path.join(destination, FINAL_DIR);
  if (fs.existsSync(finalRoot)) fail("staging destination already exists");

  const temporary = path.join(destination, `.${FINAL_DIR}-${process.pid}-${randomBytes(8).toString("hex")}.tmp`);
  try {
    fs.mkdirSync(temporary);
    fs.mkdirSync(path.join(temporary, "extensions"));
    fs.writeFileSync(path.join(temporary, "extensions", "alibaba.ts"), compatibleText, { flag: "wx", mode: entryStat.mode & 0o777 });
    const stagedMetadata = {
      name: metadata.name,
      version: metadata.version,
      type: metadata.type,
      pi: { extensions: [ENTRY] },
      peerDependencies: metadata.peerDependencies,
    };
    fs.writeFileSync(path.join(temporary, "package.json"), `${JSON.stringify(stagedMetadata, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    fs.renameSync(temporary, finalRoot);
  } catch (error) {
    try { fs.rmSync(temporary, { recursive: true, force: true }); } catch { /* only the unique run-owned temporary path */ }
    throw error;
  }
  return Object.freeze({ packageRoot: finalRoot, entry: path.join(finalRoot, ENTRY_RELATIVE) });
}
