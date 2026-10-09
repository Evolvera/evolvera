import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SOURCES = ["dist/main.js", "dist/migrations.js", "dist/core/model-runtime.js", "dist/core/model-config.js"];
const SOURCE_HASHES = {
  "package.json": "fa487897918283976006d8c4f450772a9c90b9674f2a19d5f01e3ab9af35ce8f",
  "dist/main.js": "060521b0b81f91948d8ded9139e423e5d0c9e6808a45c81750cc30519de4d2db",
  "dist/migrations.js": "8514d2573b028baeba60635498a1c5f129a602abd203ea5c37a63df2eea3fb6b",
  "dist/core/model-runtime.js": "da26f76339a031456f6d239a249159231776f760ab4ac538c6b54c417dea6f67",
  "dist/core/model-config.js": "68c447ff2ef729331713e044dae41b7416dbafbf96c83773308e2eb9c3f86107",
};
const BUILTINS = new Set(["node:readline", "node:path", "node:fs/promises", "fs", "path"]);
const PACKAGES = {
  "@earendil-works/pi-ai": { version: "1.0.1", hash: "a399220c614b97341e1ebc95ca1f052dfbb4c87455e43837e2a5f64844244141", targets: { ".": "dist/index.js", "./providers/all": "dist/providers/all.js", "./utils/model-operations": "dist/utils/model-operations.js" } },
  "@earendil-works/pi-tui": { version: "1.0.1", hash: "0c45abee07afc24d1ef3385ca914d40be84be5bae202c18884f6ec73f4f38d0e", targets: { ".": "dist/index.js" } },
  chalk: { version: "6.0.0", hash: "5a853fc6dc0c529bc126f97645989e9d60d06a2e9b20f66a6b48b0e8ef9da3ef", targets: { ".": "source/index.js" } },
  typebox: { version: "1.3.27", hash: "c59ddfd977ce941f1e8ee8b0a0b14396c332fa27cc5fa6fa165227ffd5a3992f", targets: { ".": "build/index.mjs", "./compile": "build/compile/index.mjs" } },
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const realDirChain = async (directory) => {
  const absolute = path.resolve(directory);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`path is not a real directory: ${current}`);
  }
};
const exists = async (p) => { try { await lstat(p); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } };
function within(parent, child) { const rel = path.relative(parent, child); return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel)); }
function packageSpecifier(specifier) {
  if (BUILTINS.has(specifier)) return { kind: "builtin", target: specifier };
  let name; let subpath = ".";
  if (specifier.startsWith("@")) { const parts = specifier.split("/"); name = parts.slice(0, 2).join("/"); if (parts.length > 2) subpath = `./${parts.slice(2).join("/")}`; }
  else { const parts = specifier.split("/"); name = parts[0]; if (parts.length > 1) subpath = `./${parts.slice(1).join("/")}`; }
  const entry = PACKAGES[name];
  if (!entry || !entry.targets[subpath]) throw new Error(`unapproved SDK import: ${specifier}`);
  return { kind: "package", name, target: entry.targets[subpath] };
}
function rewriteImports(source, sourcePath, stageRoot, packageRoots) {
  const imports = [];
  const pattern = /\b(?:from\s*|import\s*(?:\(\s*)?)["']([^"']+)["']/g;
  const output = source.replace(pattern, (whole, specifier) => {
    let target;
    if (specifier.startsWith(".")) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), specifier));
      if (resolved.startsWith("../") || resolved === "..") throw new Error(`relative import escapes package: ${sourcePath} -> ${specifier}`);
      if (SOURCES.includes(resolved)) target = pathToFileURL(path.join(stageRoot, resolved)).href;
      else target = pathToFileURL(path.join(packageRoots.sdk, ...resolved.split("/"))).href;
      imports.push({ from: sourcePath, specifier, target: resolved, staged: SOURCES.includes(resolved) });
    } else {
      const result = packageSpecifier(specifier);
      if (result.kind === "builtin") { imports.push({ from: sourcePath, specifier, target: result.target, builtin: true }); return whole; }
      target = pathToFileURL(path.join(packageRoots[result.name], ...result.target.split("/"))).href;
      imports.push({ from: sourcePath, specifier, target: `${result.name}/${result.target}`, staged: false });
    }
    return whole.replace(specifier, target);
  });
  return { output, imports };
}
async function assertReadOnlyTarget(file, label) {
  await realDirChain(path.dirname(file));
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`import target is not a regular file: ${label}`);
}
async function assertSource(packageRoot, relative, expected) {
  const file = path.join(packageRoot, ...relative.split("/"));
  await realDirChain(path.dirname(file));
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`source is not a regular file: ${relative}`);
  const bytes = await readFile(file);
  const actual = hash(bytes);
  if (actual !== expected) throw new Error(`source pin mismatch: ${relative}`);
  return bytes;
}

/** Importing this module is inert. This function reads pinned package text and writes one fresh code-only stage. */
export async function prepareSdkStage({ packageRoot, stageRoot, transforms }) {
  if (!packageRoot || !stageRoot || !transforms || typeof transforms !== "object") throw new TypeError("packageRoot, stageRoot and pure transforms are required");
  packageRoot = path.resolve(packageRoot); stageRoot = path.resolve(stageRoot);
  if (within(packageRoot, stageRoot) || within(stageRoot, packageRoot)) throw new Error("source and stage paths overlap");
  if (Object.keys(transforms).sort().join("\n") !== [...SOURCES].sort().join("\n") || Object.values(transforms).some((fn) => typeof fn !== "function")) throw new Error("exactly four named pure source transforms are required");
  await realDirChain(packageRoot);
  const depsRoot = path.join(packageRoot, "node_modules");
  const packageRoots = { sdk: packageRoot };
  const dependencyPins = {};
  for (const [name, expected] of Object.entries(PACKAGES)) {
    const root = path.join(depsRoot, ...name.split("/"));
    await realDirChain(root);
    const metadataBytes = await readFile(path.join(root, "package.json"));
    const metadata = JSON.parse(metadataBytes.toString("utf8"));
    if (metadata.name !== name || metadata.version !== expected.version || hash(metadataBytes) !== expected.hash) throw new Error(`dependency pin mismatch: ${name}`);
    packageRoots[name] = root;
    dependencyPins[name] = { version: metadata.version, packageJsonSha256: hash(metadataBytes), targets: expected.targets };
  }
  const original = {};
  const transformed = {};
  const sourcePins = {};
  sourcePins["package.json"] = hash(await assertSource(packageRoot, "package.json", SOURCE_HASHES["package.json"]));
  for (const file of SOURCES) {
    const bytes = await assertSource(packageRoot, file, SOURCE_HASHES[file]);
    original[file] = bytes.toString("utf8"); sourcePins[file] = hash(bytes);
    const result = transforms[file](original[file]);
    if (typeof result !== "string" || !result.length) throw new Error(`transform must return source text: ${file}`);
    transformed[file] = result;
  }
  const parent = path.dirname(stageRoot);
  await realDirChain(parent);
  if (await exists(stageRoot)) throw new Error("stage root already exists; refusing overwrite");
  const relocated = {}; const imports = [];
  for (const file of SOURCES) {
    const result = rewriteImports(transformed[file], file, stageRoot, packageRoots);
    relocated[file] = result.output; imports.push(...result.imports);
  }
  for (const edge of imports) {
    if (edge.builtin || edge.staged) continue;
    let targetRoot = packageRoot; let relativeTarget = edge.target;
    if (!edge.specifier.startsWith(".")) {
      const scoped = edge.specifier.startsWith("@") ? edge.specifier.split("/").slice(0, 2).join("/") : edge.specifier.split("/")[0];
      targetRoot = packageRoots[scoped];
      relativeTarget = edge.target.slice(scoped.length + 1);
    }
    await assertReadOnlyTarget(path.join(targetRoot, ...relativeTarget.split("/")), edge.specifier);
  }
  // Resolve and validate every output and edge before the exclusive stage creation.
  const outputs = Object.fromEntries(Object.entries(relocated).map(([file, text]) => [file, { sha256: hash(text), bytes: Buffer.byteLength(text) }]));
  const manifest = { schemaVersion: 1, package: { name: "@earendil-works/pi-coding-agent", version: "1.0.1" }, sourcePins, dependencyPins, outputs, imports, evaluation: "none; transformed SDK source was not imported or evaluated" };
  await mkdir(stageRoot); // exclusive; never clean or traverse an existing stage
  try {
    const files = { "package.json": JSON.stringify({ name: "pi-auth-only-prepared", version: "1.0.1", type: "module" }, null, 2) + "\n", ...relocated };
    for (const [relative, text] of Object.entries(files)) {
      const destination = path.join(stageRoot, ...relative.split("/"));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, text, { flag: "wx" });
      const stat = await lstat(destination);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error(`stage output is not a unique regular file: ${relative}`);
    }
    await writeFile(path.join(stageRoot, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  } catch (error) {
    // Intentionally retain partial run-owned evidence; never recursively clean a stage.
    throw error;
  }
  return manifest;
}
