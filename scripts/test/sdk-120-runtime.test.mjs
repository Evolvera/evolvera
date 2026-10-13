import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transformMainSource, transformMigrationsSource } from "../users/sdk-cli-source.mjs";
import { transformModelConfigSource, transformModelRuntimeSource } from "../users/sdk-auth-source.mjs";
import { prepareSdkStage } from "../users/sdk-stage.mjs";

const SDK_ROOT = process.env.SDK_120_ROOT;
const RUN_PARENT = process.env.SDK_RUNTIME_RUN_PARENT;
const NODE = "C:/Users/kevin/AppData/Local/nvm/v24.20.0/node.exe";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TRANSFORMS = {
  "dist/main.js": transformMainSource,
  "dist/migrations.js": transformMigrationsSource,
  "dist/core/model-runtime.js": transformModelRuntimeSource,
  "dist/core/model-config.js": transformModelConfigSource,
};
const EXPECTED_PINS = {
  "package.json": "d4231a02b6a2ccb357a8e9e420fab9c217490137ade958d4a45a12e169daad0c",
  "dist/main.js": "f4e68ceeeb8ddfd905662d2c55497fea8ccdf252a83a2ca14233ec872d742016",
  "dist/migrations.js": "8514d2573b028baeba60635498a1c5f129a602abd203ea5c37a63df2eea3fb6b",
  "dist/core/model-runtime.js": "578b742bea061fed029b8e139c6c0bcfe31e60665e9c0c6a08769761ef169dfd",
  "dist/core/model-config.js": "602795a0db074909e325e65c6b34c9120d0d2eb39f678e453a5ceffbbb37984b",
};
const sha = (data) => createHash("sha256").update(data).digest("hex");
const read = (relative) => readFileSync(path.join(SDK_ROOT, ...relative.split("/")));
const requireRunRoots = () => {
  assert.ok(SDK_ROOT && path.isAbsolute(SDK_ROOT), "SDK_120_ROOT must explicitly name the canonical SDK 1.2 fixture");
  assert.ok(RUN_PARENT && path.isAbsolute(RUN_PARENT), "SDK_RUNTIME_RUN_PARENT must explicitly name a fresh disposable parent");
  assert.ok(existsSync(NODE), "runtime must use the explicitly approved Node v24.20.0 executable");
  assert.equal(realpathSync.native(NODE), realpathSync.native(process.execPath), "test process and child process use the same Node executable");
  const sdkResolved = path.resolve(SDK_ROOT);
  assert.equal(realpathSync.native(sdkResolved), sdkResolved, "SDK fixture root must be a real canonical directory");
  assert.ok(lstatSync(sdkResolved).isDirectory() && !lstatSync(sdkResolved).isSymbolicLink(), "SDK fixture root is not an alias");
  const parentResolved = path.resolve(RUN_PARENT);
  assert.equal(realpathSync.native(parentResolved), parentResolved, "run parent must be a canonical real directory");
  const parentStat = lstatSync(parentResolved);
  assert.ok(parentStat.isDirectory() && !parentStat.isSymbolicLink(), "run parent must be a real directory");
  assert.deepEqual(readdirSync(parentResolved), [], "run parent must be fresh and empty");
  const meta = JSON.parse(read("package.json").toString("utf8"));
  assert.equal(meta.name, "@earendil-works/pi-coding-agent");
  assert.equal(meta.version, "1.2.0", "no SDK fallback is permitted");
  const pins = Object.fromEntries(Object.keys(EXPECTED_PINS).map((file) => [file, sha(read(file))]));
  assert.deepEqual(pins, EXPECTED_PINS, "SDK 1.2 source pins");
  return pins;
};
const owned = (root, name) => {
  const result = path.join(root, name);
  mkdirSync(result, { recursive: false });
  return result;
};

// Reads may reach only the run root or explicitly public source trees. Every mutating
// pathname (including every destination operand) must be inside this run root.
function writeGuard(root, publicRoots) {
  const guard = path.join(root, "guard.mjs");
  const source = `
import fs from 'node:fs'; import fsp from 'node:fs/promises'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import { syncBuiltinESMExports } from 'node:module';
import http from 'node:http'; import https from 'node:https'; import http2 from 'node:http2'; import net from 'node:net'; import tls from 'node:tls'; import dgram from 'node:dgram'; import dns from 'node:dns';
const runRoot = path.resolve(${JSON.stringify(root)});
const readRoots = ${JSON.stringify([root, ...publicRoots].map((p) => path.resolve(p)))};
const rawLog = fs.appendFileSync.bind(fs); const rawRealpath = fs.realpathSync.native; const rawLstat = fs.lstatSync.bind(fs); const logPath = path.join(runRoot, 'guard-events.jsonl');
const ownedFds = new Map();
const targetPath = value => { if (typeof value === 'number') return undefined; if (value instanceof URL) return path.resolve(fileURLToPath(value)); if (Buffer.isBuffer(value)) return path.resolve(value.toString()); return typeof value === 'string' ? path.resolve(value) : undefined; };
const within = (base, p) => p === base || p.startsWith(base + path.sep);
const inRun = value => { const p=targetPath(value); return p !== undefined && within(runRoot,p); };
const canRead = value => { const p=targetPath(value); if(p===undefined)return false; let current=p; for(;;){try{const st=rawLstat(current);if(st.isSymbolicLink())return false;const real=rawRealpath(current);return readRoots.some(r=>within(r,real));}catch(error){if(error.code!=='ENOENT'&&error.code!=='ENOTDIR')return false;const parent=path.dirname(current);if(parent===current)return false;current=parent;}} };
const log = (kind,target) => { try { rawLog(logPath, JSON.stringify({kind,target:String(target).slice(0,240)})+'\\n'); } catch {} };
const probe = (name,target) => { if(!['lstatSync','statSync','realpathSync','existsSync','accessSync','readdirSync','lstat','stat','realpath','access','readdir','exists'].includes(name))return false;const p=targetPath(target);if(p===undefined||within(runRoot,p))return false;let current=p;for(;;){if(['.git','.agents'].includes(path.basename(current)))return true;const parent=path.dirname(current);if(parent===current)return false;current=parent;} };
const denied = (kind,target,code='EACCES') => { log(kind,target); throw Object.assign(new Error('guard denied '+kind),{code}); };
const metadataTraversal = (name,p) => { const target=targetPath(p);return target!==undefined&&!inRun(p)&&!probe(name,p)&&['lstatSync','statSync','realpathSync','accessSync','existsSync','lstat','stat','realpath','access','exists'].includes(name)&&readRoots.some(r=>target!==r&&within(target,r)); };
const readPath = (name,p) => { const target=targetPath(p); if(target===undefined)return denied('fs-unresolved-'+name,p); if(probe(name,p) && !inRun(p)){log('ancestor-discovery',p);throw Object.assign(new Error('absent ancestor metadata probe'),{code:'ENOENT'});} if(metadataTraversal(name,p)){log('public-root-metadata-traversal',p);return;} if(!canRead(p))return denied('fs-read-'+name,p); };
const canonicalOwned = p => { let current=targetPath(p);if(current===undefined)return false;for(;;){if(!within(runRoot,current))return false;try{const st=rawLstat(current);if(st.isSymbolicLink())return false;return within(runRoot,rawRealpath(current));}catch(error){if(error.code!=='ENOENT'&&error.code!=='ENOTDIR')return false;const parent=path.dirname(current);if(parent===current)return false;current=parent;}} };
const writePath = (name,p) => { if(!inRun(p)||!canonicalOwned(p))return denied('fs-write-'+name,p); };
const writingFlags = flags => { if(typeof flags==='number')return (flags & (fs.constants.O_WRONLY|fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_APPEND))!==0; return typeof flags==='string' && (!flags.startsWith('r') || flags.includes('+')); };
const fdPath = (fd,write=false) => { if(fd>=0 && fd<=2){log('opaque-standard-fd',fd);return true;} const proof=ownedFds.get(fd);if(proof&&(!write||proof.run&&proof.writable))return true;return denied('fs-unproven-fd',fd); };
function patchSync(name,kind,check,operands=[0]) { const original=fs[name]; if(typeof original!=='function')return; const wrapped=function(...args){ for(const i of operands)check(name,args[i]); return original.apply(this,args); }; if(name==='realpathSync'&&original.native){ const native=original.native; wrapped.native=function(...args){check(name,args[0]);return native.apply(fs,args);}; } fs[name]=wrapped; }
for (const name of ['readFileSync','lstatSync','statSync','realpathSync','readdirSync','accessSync','readlinkSync','existsSync','createReadStream']) patchSync(name,'read',(n,p)=>typeof p==='number'?fdPath(p):readPath(n,p));
{const original=fs.existsSync;fs.existsSync=function(p){if(probe('existsSync',p)&&!inRun(p)){log('ancestor-discovery',p);return false;}readPath('existsSync',p);return original.call(this,p);};}
for (const name of ['writeFileSync','appendFileSync','mkdirSync','mkdtempSync','unlinkSync','rmSync','rmdirSync','truncateSync','chmodSync','chownSync','utimesSync','lutimesSync','createWriteStream']) patchSync(name,'write',(n,p)=>typeof p==='number'?fdPath(p,true):writePath(n,p));
for (const name of ['renameSync']) patchSync(name,'write',(n,p)=>writePath(n,p),[0,1]);
for (const name of ['copyFileSync']) { const original=fs[name]; if(original)fs[name]=function(src,dest,...rest){readPath(name,src);writePath(name,dest);return original.call(this,src,dest,...rest);}; }
if(fs.cpSync){fs.cpSync=function(src,dest,...rest){return denied('fs-recursive-copy',String(src)+' -> '+String(dest));};}
for (const name of ['linkSync']) { const original=fs[name]; if(original)fs[name]=function(src,dest,...rest){if(!inRun(src))return denied('fs-hardlink-source',src);writePath(name,src);writePath(name,dest);return original.call(this,src,dest,...rest);}; }
for (const name of ['symlinkSync']) { const original=fs[name]; if(original)fs[name]=function(target,dest,...rest){if(!inRun(target))return denied('fs-symlink-target',target);writePath(name,dest);return original.call(this,target,dest,...rest);}; }
for (const name of ['openSync']) { const original=fs[name]; fs[name]=function(p,flags,...rest){ const writable=writingFlags(flags);if(writable)writePath(name,p);else readPath(name,p);const fd=original.call(this,p,flags,...rest);ownedFds.set(fd,{run:inRun(p),writable});return fd;}; }
for (const name of ['readSync','writeSync','fstatSync','ftruncateSync','fsyncSync','fdatasyncSync','fchmodSync','fchownSync','futimesSync']) { const original=fs[name]; if(original)fs[name]=function(fd,...rest){fdPath(fd,['writeSync','ftruncateSync','fsyncSync','fdatasyncSync','fchmodSync','fchownSync','futimesSync'].includes(name));return original.call(this,fd,...rest);}; }
function patchCallback(name,mode,operands=[0]){const original=fs[name];if(typeof original!=='function')return;fs[name]=function(...args){for(const i of operands){if(typeof args[i]==='number')fdPath(args[i],mode==='write');else if(mode==='read')readPath(name,args[i]);else writePath(name,args[i]);}const cb=args.findLastIndex(x=>typeof x==='function');if(cb>=0){const callback=args[cb];args[cb]=function(error,fd,...rest){if(!error&&name==='open')ownedFds.set(fd,{run:inRun(args[0]),writable:writingFlags(args[1])});if(!error&&name==='close')ownedFds.delete(args[0]);return callback(error,fd,...rest);};}return original.apply(this,args);};}
for(const name of ['readFile','lstat','stat','realpath','readdir','access','readlink','exists','createReadStream'])patchCallback(name,'read');
if(fs.exists){const original=fs.exists;fs.exists=function(p,callback){if(probe('exists',p)&&!inRun(p)){log('ancestor-discovery',p);queueMicrotask(()=>callback(false));return;}readPath('exists',p);return original.call(this,p,callback);};}
for(const name of ['writeFile','appendFile','mkdir','mkdtemp','unlink','rm','rmdir','truncate','chmod','chown','utimes','lutimes','createWriteStream'])patchCallback(name,'write');
patchCallback('rename','write',[0,1]);
if(fs.copyFile){const original=fs.copyFile;fs.copyFile=function(src,dest,...args){readPath('copyFile',src);writePath('copyFile',dest);return original.call(this,src,dest,...args);};}
if(fs.link){const original=fs.link;fs.link=function(src,dest,...args){if(!inRun(src))return denied('fs-hardlink-source',src);writePath('link',src);writePath('link',dest);return original.call(this,src,dest,...args);};}
if(fs.symlink){const original=fs.symlink;fs.symlink=function(target,dest,...args){if(!inRun(target))return denied('fs-symlink-target',target);writePath('symlink',dest);return original.call(this,target,dest,...args);};}
if(fs.open){const original=fs.open;fs.open=function(p,flags,...args){const writable=writingFlags(flags);if(writable)writePath('open',p);else readPath('open',p);const cb=args.findLastIndex(x=>typeof x==='function');if(cb>=0){const callback=args[cb];args[cb]=function(error,fd,...rest){if(!error)ownedFds.set(fd,{run:inRun(p),writable});return callback(error,fd,...rest);};}return original.call(this,p,flags,...args);};}
for(const name of ['read','write']){const original=fs[name];if(original)fs[name]=function(fd,...args){fdPath(fd,name==='write');return original.call(this,fd,...args);};}
for (const name of ['closeSync']) { const original=fs[name]; if(original)fs[name]=function(fd,...rest){const out=original.call(this,fd,...rest);ownedFds.delete(fd);return out;}; }
if(fs.close){const original=fs.close;fs.close=function(fd,...args){fdPath(fd);const cb=args.findLastIndex(x=>typeof x==='function');if(cb>=0){const callback=args[cb];args[cb]=function(error,...rest){if(!error)ownedFds.delete(fd);return callback(error,...rest);};}return original.call(this,fd,...args);};}
function patchPromise(name,mode,operands=[0]) { const original=fsp[name];if(typeof original!=='function')return;fsp[name]=async function(...args){for(const i of operands){const value=args[i];if(typeof value==='number'||value&&typeof value.fd==='number')fdPath(typeof value==='number'?value:value.fd,mode==='write');else if(mode==='read')readPath(name,value);else writePath(name,value);}return original.apply(this,args);}; }
for(const name of ['readFile','lstat','stat','realpath','readdir','access','readlink','opendir'])patchPromise(name,'read');
for(const name of ['writeFile','appendFile','mkdir','mkdtemp','unlink','rm','rmdir','truncate','chmod','chown','utimes','lutimes'])patchPromise(name,'write');
patchPromise('rename','write',[0,1]); if(fsp.copyFile){const original=fsp.copyFile;fsp.copyFile=async function(src,dest,...rest){readPath('copyFile',src);writePath('copyFile',dest);return original.call(this,src,dest,...rest);};}
if(fsp.link){const original=fsp.link;fsp.link=async function(src,dest,...rest){if(!inRun(src))return denied('fs-hardlink-source',src);writePath('link',src);writePath('link',dest);return original.call(this,src,dest,...rest);};}
if(fsp.symlink){const original=fsp.symlink;fsp.symlink=async function(target,dest,...rest){if(!inRun(target))return denied('fs-symlink-target',target);writePath('symlink',dest);return original.call(this,target,dest,...rest);};}
if(fsp.cp){fsp.cp=async function(src,dest,...rest){return denied('fs-recursive-copy',String(src)+' -> '+String(dest));};}
if(fs.cp){fs.cp=function(src,dest,...rest){return denied('fs-recursive-copy',String(src)+' -> '+String(dest));};}
for(const name of ['watch','watchFile']){const original=fs[name];if(original)fs[name]=function(p,...args){readPath(name,p);return original.call(this,p,...args);};}
if(fsp.watch){const original=fsp.watch;fsp.watch=function(p,...args){readPath('watch',p);return original.call(this,p,...args);};}
const originalFsOpen=fsp.open.bind(fsp); fsp.open=async function(p,flags,...rest){const writable=writingFlags(flags);if(writable)writePath('open',p);else readPath('open',p);const handle=await originalFsOpen(p,flags,...rest);ownedFds.set(handle.fd,{run:inRun(p),writable});const close=handle.close.bind(handle);handle.close=async()=>{try{return await close();}finally{ownedFds.delete(handle.fd);}};return handle;};
const denyNetwork=kind=>(...args)=>{log(kind,args[0]?.hostname??args[0]?.host??args[0]??'');throw Object.assign(new Error('egress denied'),{code:'EPERM'});};
globalThis.fetch=denyNetwork('fetch'); if(globalThis.WebSocket)globalThis.WebSocket=class{constructor(url){return denyNetwork('websocket')(url);}};
http.request=denyNetwork('http');http.get=denyNetwork('http');https.request=denyNetwork('https');https.get=denyNetwork('https');http2.connect=denyNetwork('http2');net.connect=denyNetwork('net');net.createConnection=denyNetwork('net');net.Socket.prototype.connect=denyNetwork('socket-connect');tls.connect=denyNetwork('tls');dgram.createSocket=denyNetwork('dgram');
for(const name of ['lookup','lookupService','resolve','resolve4','resolve6','resolveAny','resolveCname','resolveMx','resolveNaptr','resolveNs','resolvePtr','resolveSoa','resolveSrv','resolveTxt','reverse'])if(typeof dns[name]==='function')dns[name]=denyNetwork('dns-'+name);
for(const name of ['lookup','resolve','resolve4','resolve6','resolveAny','resolveCname','resolveMx','resolveNaptr','resolveNs','resolvePtr','resolveSoa','resolveSrv','resolveTxt','reverse'])if(typeof dns.promises[name]==='function')dns.promises[name]=denyNetwork('dns-'+name);
syncBuiltinESMExports();
`;
  writeFileSync(guard, source, { flag: "wx" });
  return guard;
}

function sanitizedEnv(root, guard, extra = {}) {
  const system = process.env.SystemRoot ?? process.env.WINDIR ?? "C:\\Windows";
  return {
    SystemRoot: system, WINDIR: system,
    PATH: [path.dirname(NODE), path.join(system, "System32")].join(path.delimiter),
    HOME: root, USERPROFILE: root, PI_CODING_AGENT_DIR: path.join(root, "pi"),
    TMP: root, TEMP: root, JITI_CACHE_DIR: path.join(root, "jiti"),
    PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1",
    SDK_120_ROOT: SDK_ROOT, SDK_RUNTIME_RUN_PARENT: RUN_PARENT,
    NODE_OPTIONS: `--import=${pathToFileURL(guard).href}`,
    ...extra,
  };
}

// One node:test invocation creates exactly one unique run root and never deletes it. The root
// remains as the evidence/recovery boundary, including partial failures.
test("SDK 1.2 managed runtime, native metadata and personalized catalog isolation", async (t) => {
  const sourcePins = requireRunRoots();
  const windowsCleanupSourcePath = path.join(SDK_ROOT, "dist/utils/windows-self-update.js");
  const windowsCleanupSourceHash = sha(read("dist/utils/windows-self-update.js"));
  assert.match(read("dist/utils/windows-self-update.js").toString("utf8"), /export function cleanupWindowsSelfUpdateQuarantine\(packageDir\)/);
  const run = mkdtempSync(path.join(RUN_PARENT, "sdk-120-runtime-"));
  const evidence = { runRoot: run, sdkVersion: "1.2.0", sourcePins, statuses: [], binding: null, catalogs: {}, egressAttempts: [], claims: ["native CLI help; staged SDK/runtime and account binding; synthetic cache isolation and credential-store adapter only", "no provider execution, physical TUI, or inheritance certification"] };
  t.diagnostic(`SDK1.2 synthetic runtime evidence root: ${run}`);
  const stage = path.join(run, "stage");
  const manifest = await prepareSdkStage({ packageRoot: SDK_ROOT, stageRoot: stage, transforms: TRANSFORMS });
  assert.equal(manifest.package.version, "1.2.0");
  assert.equal(manifest.evaluation, "none; transformed SDK source was not imported or evaluated");
  evidence.sdkStage = { sourcePins: manifest.sourcePins, dependencyPins: manifest.dependencyPins, outputs: manifest.outputs };
  const publicSourceRoots = [path.join(REPO, "scripts/users"), path.join(REPO, "scripts/compat/alibaba-users.mjs"), path.join(REPO, "extensions/usuario.ts")];
  const stageGuard = writeGuard(run, publicSourceRoots.concat(SDK_ROOT));
  const isolatedEnv = sanitizedEnv(run, stageGuard);
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, isolatedEnv);
  await import(pathToFileURL(stageGuard));

  // Import the actual staged runtime and public session API only after the run-owned environment
  // exists. Imports are local to the verified fixture/stage; auth is a no-secret in-memory adapter.
  const stageMain = await import(pathToFileURL(path.join(stage, "dist/main.js")));
  const stageRuntime = await import(pathToFileURL(path.join(stage, "dist/core/model-runtime.js")));
  const stageConfig = await import(pathToFileURL(path.join(stage, "dist/core/model-config.js")));
  const sdk = await import(pathToFileURL(path.join(SDK_ROOT, "dist/index.js")));
  const storeModule = await import(pathToFileURL(path.join(SDK_ROOT, "dist/core/models-store.js")));
  assert.equal(typeof stageMain.main, "function");
  assert.equal(typeof stageRuntime.ModelRuntime.create, "function");
  assert.equal(typeof sdk.SessionManager.inMemory, "function");
  assert.equal(typeof storeModule.FileModelsStore, "function");
  assert.equal(typeof stageConfig.ModelConfig.load, "function");

  // Exercise the real managed native CLI parser/help in a dedicated process; it cannot access
  // user config because all roots are run-owned and the preload denies outside filesystem access.
  const child = path.join(run, "native-help.mjs");
  writeFileSync(child, `
import { launchUser } from ${JSON.stringify(pathToFileURL(path.join(REPO,"scripts/users/launcher.mjs")).href)};
await launchUser(['--help','--offline','--no-extensions','--no-skills','--no-prompt-templates','--no-context-files','--no-themes','--no-mcp'], { packageRoot: process.env.SDK_120_ROOT, registryPath: ${JSON.stringify(path.join(run,"registry.json"))}, env: process.env });
`, { flag: "wx" });
  const help = spawnSync(NODE, [child], { cwd: run, env: sanitizedEnv(run, stageGuard), encoding: "utf8", timeout: 30_000 });
  evidence.statuses.push({ operation: "managed-native-help", status: help.status, signal: help.signal ?? null });
  assert.equal(help.status, 0, `native SDK --help failed: ${help.stderr}`);
  assert.match(help.stdout + help.stderr, /Usage:|Options:|--help/i);

  // This source path is a real account-runtime factory; use the actual SDK in-memory native
  // session manager and ModelRuntime.create, with only the credential boundary substituted.
  const { createUserRuntime } = await import(pathToFileURL(path.join(REPO, "scripts/users/runtime.mjs")));
  const { createAccount } = await import(pathToFileURL(path.join(REPO, "scripts/users/account-session.mjs")));
  const { createUserCredentialStore } = await import(pathToFileURL(path.join(REPO, "scripts/users/credentials.mjs")));
  // pi-ai 1.2.0 auth/types.d.ts defines ApiKeyCredential as { type: "api_key", key?: string, env?: ProviderEnv }.
  // Its CredentialStore methods are read/list/modify/delete; this exercise only modify/read/list.
  const registryPath = path.join(run, "accounts.json");
  const cachePath = path.join(run, "shared-models-store.json");
  const alpha = createAccount({ registryPath, id: "alpha", label: "Alpha" });
  const beta = createAccount({ registryPath, id: "beta", label: "Beta" });
  process.env.SDK_RUNTIME_TEST_AMBIENT_ONLY = "synthetic-ambient-only";
  const alphaNativeCredentials = createUserCredentialStore(alpha, { sdkRoot: SDK_ROOT, accountEnv: {} });
  const betaNativeCredentials = createUserCredentialStore(beta, { sdkRoot: SDK_ROOT, accountEnv: {} });
  await alphaNativeCredentials.modify("synthetic-native", async (current) => { assert.equal(current, undefined); return { type: "api_key", key: "$SDK_RUNTIME_TEST_OWNED", env: { SDK_RUNTIME_TEST_OWNED: "synthetic-alpha-key" } }; });
  await betaNativeCredentials.modify("synthetic-native", async (current) => { assert.equal(current, undefined); return { type: "api_key", key: "$SDK_RUNTIME_TEST_OWNED", env: { SDK_RUNTIME_TEST_OWNED: "synthetic-beta-key" } }; });
  await alphaNativeCredentials.modify("synthetic-ambient", async () => ({ type: "api_key", key: "$SDK_RUNTIME_TEST_AMBIENT_ONLY", env: {} }));
  const alphaNativeRead = await alphaNativeCredentials.read("synthetic-native");
  const betaNativeRead = await betaNativeCredentials.read("synthetic-native");
  assert.equal(alphaNativeRead.key, "synthetic-alpha-key");
  assert.equal(betaNativeRead.key, "synthetic-beta-key");
  assert.equal(await alphaNativeCredentials.read("synthetic-ambient").then((value) => value.key), undefined, "sealed accountEnv prevents ambient environment fallback");
  assert.equal(await alphaNativeCredentials.read("beta-only"), undefined);
  assert.deepEqual(await alphaNativeCredentials.list(), [{ providerId: "synthetic-native", type: "api_key" }, { providerId: "synthetic-ambient", type: "api_key" }]);
  assert.deepEqual(await betaNativeCredentials.list(), [{ providerId: "synthetic-native", type: "api_key" }]);
  assert.ok(existsSync(path.join(alpha.agentDir, "auth.json")) && existsSync(path.join(beta.agentDir, "auth.json")), "credential adapter persisted only run-owned account files");
  const accountCreates = [];
  const credentialStore = Object.freeze({ read: async () => undefined, list: async () => [], modify: async () => { throw new Error("credential mutation denied"); }, delete: async () => { throw new Error("credential mutation denied"); } });
  const accountFactory = createUserRuntime(registryPath, {
    sdkRoot: SDK_ROOT, pickAccount: async () => "alpha",
    createStore: (profile) => { accountCreates.push(profile.id); return credentialStore; },
    createModelRuntime: (request) => stageRuntime.ModelRuntime.create({ ...request, modelsStorePath: cachePath, allowModelNetwork: false }),
  });
  const cwd = owned(run, "workspace");
  const manager = sdk.SessionManager.inMemory(cwd);
  const modelRuntime = async (profileManager) => accountFactory({ purpose: "application", sessionManager: profileManager, cwd, agentDir: alpha.agentDir, sdkRoot: SDK_ROOT, parsed: {}, modelRuntimeTimeoutMs: 5000 });
  const selected = await modelRuntime(manager);
  assert.ok(selected.modelRuntime instanceof stageRuntime.ModelRuntime);
  const bindingEntry = manager.getEntries().find((entry) => entry.customType === "pi.account");
  assert.deepEqual(bindingEntry?.data, { version: 1, accountId: "alpha" });
  evidence.binding = bindingEntry.data;
  evidence.ownedPaths = { stage, registryPath, cachePath, cwd, alphaAgentDir: alpha.agentDir, alphaAuthPath: path.join(alpha.agentDir, "auth.json"), betaAgentDir: beta.agentDir, betaAuthPath: path.join(beta.agentDir, "auth.json"), home: process.env.HOME, userProfile: process.env.USERPROFILE, piDir: process.env.PI_CODING_AGENT_DIR, tmp: process.env.TMP, temp: process.env.TEMP, jiti: process.env.JITI_CACHE_DIR };
  for (const ownedPath of Object.values(evidence.ownedPaths)) assert.ok(ownedPath === run || ownedPath.startsWith(run + path.sep), `owned path must remain under run root: ${ownedPath}`);
  evidence.statuses.push({ operation: "native-credential-store", alphaBetaSeparated: true, apiKeyCredentialValidated: true, listMetadataOnly: true, ambientFallbackBlocked: true, persistence: "owned auth.json only" });

  // Drive /usuario through the actual SDK factory loader and command registry, not a fake
  // command implementation. The synthetic UI is only a sink; no TUI is created.
  const eventBusModule = await import(pathToFileURL(path.join(SDK_ROOT, "dist/core/event-bus.js")));
  const loader = await import(pathToFileURL(path.join(SDK_ROOT, "dist/core/extensions/loader.js")));
  const bus = eventBusModule.createEventBus();
  const extensionFactory = selected.resourceLoaderOptions.extensionFactories.find((item) => item.name === "usuario")?.factory;
  assert.equal(typeof extensionFactory, "function", "managed runtime provides the built-in /usuario factory");
  assert.equal(typeof loader.loadExtensionFromFactory, "function");
  const runtime = loader.createExtensionRuntime();
  const loadedUsuario = await loader.loadExtensionFromFactory(extensionFactory, cwd, bus, runtime, "usuario");
  evidence.statuses.push({ operation: "usuario-extension-registration", registered: loadedUsuario.commands.has("usuario") });
  assert.ok(loadedUsuario.commands.has("usuario"), "SDK factory loader must register /usuario");
  let statusText = "";
  await loadedUsuario.commands.get("usuario").handler("status", { sessionManager: manager, hasUI: true, ui: { notify: (text) => { statusText = text; } } });
  assert.match(statusText, /\"managed\":true/);
  assert.match(statusText, /\"binding\":\"fixed-for-process\"/);
  evidence.statuses.push({ operation: "usuario-status", statusText });

  const betaManager = sdk.SessionManager.inMemory(cwd);
  betaManager.appendCustomEntry("pi.account", { version: 1, accountId: "beta" });
  await assert.rejects(() => accountFactory({ purpose: "application", sessionManager: betaManager, cwd, agentDir: beta.agentDir, sdkRoot: SDK_ROOT, parsed: {}, modelRuntimeTimeoutMs: 5000 }), /ACCOUNT_PROCESS_RESTART_REQUIRED/);
  assert.deepEqual(accountCreates, ["alpha"], "bound process rejects beta before constructing its store");
  const betaFactory = createUserRuntime(registryPath, {
    sdkRoot: SDK_ROOT, pickAccount: async () => "beta", createStore: (profile) => { accountCreates.push(profile.id); return credentialStore; },
    createModelRuntime: (request) => stageRuntime.ModelRuntime.create({ ...request, modelsStorePath: cachePath, allowModelNetwork: false }),
  });
  const betaRuntime = await betaFactory({ purpose: "application", sessionManager: betaManager, cwd, agentDir: beta.agentDir, sdkRoot: SDK_ROOT, parsed: {}, modelRuntimeTimeoutMs: 5000 });
  assert.ok(betaRuntime.modelRuntime instanceof stageRuntime.ModelRuntime);

  // Native store operations use the actual SDK FileModelsStore; these synthetic legacy/scoped
  // values are metadata only and never sent to a provider.
  const fileStore = new storeModule.FileModelsStore(cachePath);
  const builtin = (provider, id) => {
    const native = selected.modelRuntime.getAllModels(provider)[0];
    assert.ok(native, `SDK provides a native ${provider} model for a valid synthetic clone`);
    return { ...structuredClone(native), id, name: id };
  };
  const authSource = await import(pathToFileURL(path.join(REPO, "scripts/users/sdk-auth-source.mjs")));
  const policyAlpha = authSource.wrapModelsStore(fileStore, "alpha", registryPath);
  const policyBeta = authSource.wrapModelsStore(fileStore, "beta", registryPath);
  const alphaConfigPolicy = authSource.createAccountConfigPolicy({ profile: alpha, env: {} });
  const configPath = path.join(alpha.agentDir, "models.json");
  const modelConfigInput = { providers: { synthetic: { apiKey: "synthetic-no-secret", headers: { Authorization: "synthetic-no-secret" }, models: [{ id: "safe", contextWindow: 4096, maxTokens: 1024, headers: { Authorization: "synthetic-no-secret" } }], modelOverrides: { safe: { headers: { Authorization: "synthetic-no-secret" } } } } } };
  writeFileSync(configPath, JSON.stringify(modelConfigInput), { flag: "wx" });
  const filteredConfig = await stageConfig.ModelConfig.load(configPath, alphaConfigPolicy.filterConfig);
  assert.equal(filteredConfig.getError(), undefined, "native ModelConfig schema accepts positive contextWindow/maxTokens before policy filtering");
  const filteredProvider = filteredConfig.getProvider("synthetic");
  assert.equal(filteredProvider.apiKey, undefined);
  assert.equal(filteredProvider.headers, undefined);
  assert.equal(filteredProvider.models[0].headers, undefined);
  assert.equal(filteredProvider.modelOverrides.safe.headers, undefined);
  writeFileSync(configPath, JSON.stringify({ providers: { synthetic: { models: [{ id: "invalid", contextWindow: 0, maxTokens: 1024 }] } } }));
  const invalidConfig = await stageConfig.ModelConfig.load(configPath, alphaConfigPolicy.filterConfig);
  assert.match(invalidConfig.getError(), /contextWindow/);
  evidence.statuses.push({ operation: "native-model-config", positiveLimits: true, authFieldsFiltered: true, zeroContextWindowRejected: true });
  const catalog = (id) => ({ models: [builtin("openrouter", id)], checkedAt: Date.now() });
  await policyAlpha.write("openrouter", catalog("synthetic-alpha"));
  await policyBeta.write("openrouter", catalog("synthetic-beta"));
  await fileStore.write("openrouter", catalog("synthetic-legacy"));
  assert.deepEqual((await policyAlpha.read("openrouter")).models.map((m) => m.id), ["synthetic-alpha"]);
  assert.deepEqual((await policyBeta.read("openrouter")).models.map((m) => m.id), ["synthetic-beta"]);
  await selected.modelRuntime.refresh({ allowNetwork: false });
  await betaRuntime.modelRuntime.refresh({ allowNetwork: false });
  assert.deepEqual(selected.modelRuntime.getAllModels("openrouter").map((model) => model.id), ["synthetic-alpha"]);
  assert.deepEqual(betaRuntime.modelRuntime.getAllModels("openrouter").map((model) => model.id), ["synthetic-beta"]);
  evidence.statuses.push({ operation: "native-catalog-refresh", alpha: selected.modelRuntime.getAllModels("openrouter").map((model) => model.id), beta: betaRuntime.modelRuntime.getAllModels("openrouter").map((model) => model.id) });
  const otherRegistry = path.join(run, "other", "accounts.json");
  mkdirSync(path.dirname(otherRegistry));
  const otherAccount = authSource.wrapModelsStore(fileStore, "alpha", otherRegistry);
  assert.equal(await otherAccount.read("openrouter"), undefined);
  assert.deepEqual((await fileStore.read("openrouter")).models.map((m) => m.id), ["synthetic-legacy"]);
  await policyAlpha.write("anthropic", catalog("generic-shared"));
  assert.deepEqual((await fileStore.read("anthropic")).models.map((m) => m.id), ["generic-shared"]);
  assert.ok(existsSync(cachePath), "native FileModelsStore persisted the synthetic entries");
  const persisted = JSON.parse(readFileSync(cachePath, "utf8"));
  const registryIdentity = sha(process.platform === "win32" ? registryPath.toLowerCase() : registryPath);
  assert.ok(persisted[`pi.account/${registryIdentity}/alpha/openrouter`]);
  assert.ok(persisted[`pi.account/${registryIdentity}/beta/openrouter`]);
  assert.ok(persisted.openrouter, "unmanaged legacy key remains preserved");
  assert.ok(persisted.anthropic, "generic provider key remains native/shared");
  const metadataFactory = createUserRuntime(registryPath, {
    sdkRoot: SDK_ROOT, createStore: () => { throw new Error("metadata must not create an auth store"); },
    createModelRuntime: (request) => stageRuntime.ModelRuntime.create({ ...request, modelsStorePath: cachePath, allowModelNetwork: false }),
  });
  const metadataRuntime = await metadataFactory({ purpose: "metadata", agentDir: path.join(run, "metadata"), sdkRoot: SDK_ROOT, parsed: {}, modelRuntimeTimeoutMs: 5000 });
  await metadataRuntime.modelRuntime.refresh({ allowNetwork: false });
  assert.ok(!metadataRuntime.modelRuntime.getAllModels("openrouter").some((model) => model.id.startsWith("synthetic-")), "anonymous metadata runtime never restores personalized or legacy catalog");
  evidence.catalogs = { alpha: "synthetic-alpha", beta: "synthetic-beta", unmanagedLegacy: "synthetic-legacy", otherRegistry: "empty", genericProvider: "shared", metadataRestoration: "none", nativeFilePersistence: true };
  const guardEvents = existsSync(path.join(run, "guard-events.jsonl")) ? readFileSync(path.join(run, "guard-events.jsonl"), "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)) : [];
  const quarantineCleanupPath = path.join(path.dirname(path.dirname(SDK_ROOT)), ".pi-native-quarantine");
  evidence.blockedSdkCleanupAttempts = guardEvents.filter((event) => event.kind === "fs-write-rmSync" && path.resolve(event.target).toLowerCase() === path.resolve(quarantineCleanupPath).toLowerCase());
  evidence.filesystemViolations = guardEvents.filter((event) => event.kind.startsWith("fs-") && !evidence.blockedSdkCleanupAttempts.includes(event));
  const networkKinds = new Set(["fetch", "websocket", "http", "https", "http2", "net", "socket-connect", "tls", "dgram", ...guardEvents.filter((event) => event.kind.startsWith("dns-")).map((event) => event.kind)]);
  evidence.egressAttempts = guardEvents.filter((event) => networkKinds.has(event.kind));
  evidence.ancestorDiscoveryProbes = guardEvents.filter((event) => event.kind === "ancestor-discovery");
  evidence.publicSourceMetadataTraversal = guardEvents.filter((event) => event.kind === "public-root-metadata-traversal");
  evidence.opaqueStandardFdOperations = guardEvents.filter((event) => event.kind === "opaque-standard-fd");
  evidence.sourcePostcheck = Object.fromEntries(Object.keys(EXPECTED_PINS).map((file) => [file, sha(read(file))]));
  evidence.windowsCleanupSourcePostcheck = sha(read("dist/utils/windows-self-update.js"));
  evidence.windowsCleanupSource = { file: windowsCleanupSourcePath, before: windowsCleanupSourceHash, after: evidence.windowsCleanupSourcePostcheck };
  writeFileSync(path.join(run, "receipt.json"), JSON.stringify(evidence, null, 2) + "\n", { flag: "wx" });
  assert.deepEqual(evidence.sourcePostcheck, sourcePins, "fixture unchanged after runtime exercise");
  assert.equal(evidence.windowsCleanupSourcePostcheck, windowsCleanupSourceHash, "native cleanup implementation remained unchanged");
  assert.equal(accountCreates.join(","), "alpha,beta", "cross-account process binding fails before beta store construction; separate beta factory succeeds");
  assert.deepEqual(evidence.egressAttempts, [], "all guarded egress types, including Socket.prototype.connect and DNS, remain unused");
  assert.deepEqual(evidence.blockedSdkCleanupAttempts, [{ kind: "fs-write-rmSync", target: quarantineCleanupPath }], "SDK 1.2's documented Windows startup quarantine cleanup is blocked before touching the fixture node_modules tree");
  assert.deepEqual(evidence.filesystemViolations, [], "no other filesystem access or mutation escaped the run/public-read boundary");
  assert.ok(!guardEvents.some((event) => event.kind === "fs-unproven-fd"), "no unproven non-standard file descriptor was used");
});
