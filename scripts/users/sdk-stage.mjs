import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SOURCES = ["dist/main.js", "dist/migrations.js", "dist/core/model-runtime.js", "dist/core/model-config.js"];
const SDK_PINS = {
  "1.0.1": {
    "package.json": "fa487897918283976006d8c4f450772a9c90b9674f2a19d5f01e3ab9af35ce8f",
    "dist/main.js": "060521b0b81f91948d8ded9139e423e5d0c9e6808a45c81750cc30519de4d2db",
    "dist/migrations.js": "8514d2573b028baeba60635498a1c5f129a602abd203ea5c37a63df2eea3fb6b",
    "dist/core/model-runtime.js": "da26f76339a031456f6d239a249159231776f760ab4ac538c6b54c417dea6f67",
    "dist/core/model-config.js": "68c447ff2ef729331713e044dae41b7416dbafbf96c83773308e2eb9c3f86107",
  },
  "1.1.0": {
    "package.json": "c662a36f8bc47843393a60dc8616a34dfcc8376e8fcc96dbc2f1020c60e38e2a",
    "dist/main.js": "866d65f2d42f74d2bb72ed4a755c8ace1b8a2c497a32cb57cc4db594a4fcb2bf",
    "dist/migrations.js": "8514d2573b028baeba60635498a1c5f129a602abd203ea5c37a63df2eea3fb6b",
    "dist/core/model-runtime.js": "732c2be87ac94ceb1f9c68074eb78c15bc189f21671414bb91bcd0cf141d5b9c",
    "dist/core/model-config.js": "24a0e0f98672766e16e00d9f61587f50f9481915581156ae71a14e48ee912e4c",
  },
  "1.2.0": {
    "package.json": "d4231a02b6a2ccb357a8e9e420fab9c217490137ade958d4a45a12e169daad0c",
    "dist/main.js": "f4e68ceeeb8ddfd905662d2c55497fea8ccdf252a83a2ca14233ec872d742016",
    "dist/migrations.js": "8514d2573b028baeba60635498a1c5f129a602abd203ea5c37a63df2eea3fb6b",
    "dist/core/model-runtime.js": "578b742bea061fed029b8e139c6c0bcfe31e60665e9c0c6a08769761ef169dfd",
    "dist/core/model-config.js": "602795a0db074909e325e65c6b34c9120d0d2eb39f678e453a5ceffbbb37984b",
  },
  "1.3.0": {
    "package.json": "83c3bb7619f590c213cc96a24216eb29a819a3ef6dc548607cc037ed276e8dc5",
    "dist/main.js": "08b91f9eb3adf9a5027c18732d1e4de70999bd15c445b65cb0ddd0cd68f2746b",
    "dist/migrations.js": "8514d2573b028baeba60635498a1c5f129a602abd203ea5c37a63df2eea3fb6b",
    "dist/core/model-runtime.js": "578b742bea061fed029b8e139c6c0bcfe31e60665e9c0c6a08769761ef169dfd",
    "dist/core/model-config.js": "602795a0db074909e325e65c6b34c9120d0d2eb39f678e453a5ceffbbb37984b",
  },
  "1.4.0": {
    "package.json": "df6883685382d6a914e5797232744c26579fe7db5576ea0e9c859d018ca2d54e",
    "dist/main.js": "08b91f9eb3adf9a5027c18732d1e4de70999bd15c445b65cb0ddd0cd68f2746b",
    "dist/migrations.js": "8514d2573b028baeba60635498a1c5f129a602abd203ea5c37a63df2eea3fb6b",
    "dist/core/model-runtime.js": "44d8017928eff6721d5a56b4e71f98bcafb124f5aa6e7d3f016491e11fcf6461",
    "dist/core/model-config.js": "b4ecb1165c328fdb5f8b767519f2b632c31737f86d0ce1d7a05959e7c8354d93",
  },
};
const BUILTINS = new Set(["node:readline", "node:path", "node:fs/promises", "fs", "path"]);
const PACKAGE_PINS = {
  "1.0.1": {
    "@earendil-works/pi-ai": { version: "1.0.1", hash: "a399220c614b97341e1ebc95ca1f052dfbb4c87455e43837e2a5f64844244141" },
    "@earendil-works/pi-tui": { version: "1.0.1", hash: "0c45abee07afc24d1ef3385ca914d40be84be5bae202c18884f6ec73f4f38d0e" },
  },
  "1.1.0": {
    "@earendil-works/pi-ai": { version: "1.1.0", hash: "a8f10d5157b335379ae00edf9c25ae7a15bfc0f3a76107d4376a3779bb5b2995" },
    "@earendil-works/pi-tui": { version: "1.1.0", hash: "25d27adb55392f5bfa4f354f5b5e070f1d5dcb1bb3ef92af244b08541a3ba51d" },
  },
  "1.2.0": {
    "@earendil-works/pi-ai": { version: "1.2.0", hash: "3838d036bbb844ea6d4d08ef199423a0335022e34b5d5c8833257f64e4cae625" },
    "@earendil-works/pi-tui": { version: "1.2.0", hash: "825dd2b1199043dadd9c4f9251dac888e41feef2b82dedba24f8ce7c88cfd42c" },
  },
  "1.3.0": {
    "@earendil-works/pi-ai": { version: "1.3.0", hash: "4e9ed07b06a91d844485874c251f312b610d015a4a4fd32c78cde58a7862a3f1" },
    "@earendil-works/pi-tui": { version: "1.3.0", hash: "a6a82af81ed5b6069267eabfdcf047d0af8013695b0e64d72f3c9f44f8e8124e" },
  },
  "1.4.0": {
    "@earendil-works/pi-ai": { version: "1.4.0", hash: "36df91142c18a5912eafab0f2783bb4d88cdd101c5c5e7fd9173d4387cc5cced" },
    "@earendil-works/pi-tui": { version: "1.4.0", hash: "49362a3815b3f69728c68243609d63355aa54b4c374414c5b037560b41ca6038" },
  },
};
const COMMON_PACKAGES = {
  chalk: { version: "6.0.0", hash: "5a853fc6dc0c529bc126f97645989e9d60d06a2e9b20f66a6b48b0e8ef9da3ef" },
  typebox: { version: "1.3.27", hash: "c59ddfd977ce941f1e8ee8b0a0b14396c332fa27cc5fa6fa165227ffd5a3992f" },
};
const PACKAGE_TARGETS = {
  "@earendil-works/pi-ai": { ".": "dist/index.js", "./providers/all": "dist/providers/all.js", "./providers/openrouter": "dist/providers/openrouter.js", "./providers/compat-schema": "dist/providers/compat-schema.js", "./providers/model-schema": "dist/providers/model-schema.js", "./utils/model-operations": "dist/utils/model-operations.js" },
  "@earendil-works/pi-tui": { ".": "dist/index.js" },
  chalk: { ".": "source/index.js" },
  typebox: { ".": "build/index.mjs", "./compile": "build/compile/index.mjs" },
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
function packageSpecifier(specifier, packages) {
  if (BUILTINS.has(specifier)) return { kind: "builtin", target: specifier };
  let name; let subpath = ".";
  if (specifier.startsWith("@")) { const parts = specifier.split("/"); name = parts.slice(0, 2).join("/"); if (parts.length > 2) subpath = `./${parts.slice(2).join("/")}`; }
  else { const parts = specifier.split("/"); name = parts[0]; if (parts.length > 1) subpath = `./${parts.slice(1).join("/")}`; }
  const entry = packages[name];
  if (!entry || !entry.targets[subpath]) throw new Error(`unapproved SDK import: ${specifier}`);
  return { kind: "package", name, target: entry.targets[subpath] };
}
function rewriteImports(source, sourcePath, stageRoot, packageRoots, packages) {
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
      const result = packageSpecifier(specifier, packages);
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
  const metadataPath = path.join(packageRoot, "package.json");
  const metadataStat = await lstat(metadataPath);
  if (!metadataStat.isFile() || metadataStat.isSymbolicLink()) throw new Error("SDK package metadata is not a regular file");
  const metadataBytes = await readFile(metadataPath);
  const metadata = JSON.parse(metadataBytes.toString("utf8"));
  const version = metadata.version;
  const sourceHashes = typeof version === "string" && Object.hasOwn(SDK_PINS, version) ? SDK_PINS[version] : undefined;
  if (metadata.name !== "@earendil-works/pi-coding-agent" || !sourceHashes || hash(metadataBytes) !== sourceHashes["package.json"]) throw new Error("SDK package pin mismatch or unsupported version");
  const packageRoots = { sdk: packageRoot };
  const dependencyPins = {};
  const packages = { ...PACKAGE_PINS[version], ...COMMON_PACKAGES };
  const approvedPackages = Object.fromEntries(Object.entries(packages).map(([name, pin]) => [name, { ...pin, targets: PACKAGE_TARGETS[name] }]));
  const depsRoot = path.join(packageRoot, "node_modules");
  for (const [name, pin] of Object.entries(packages)) {
    const expected = { ...pin, targets: PACKAGE_TARGETS[name] };
    const root = path.join(depsRoot, ...name.split("/"));
    await realDirChain(root);
    const dependencyMetadataBytes = await readFile(path.join(root, "package.json"));
    const dependencyMetadata = JSON.parse(dependencyMetadataBytes.toString("utf8"));
    if (dependencyMetadata.name !== name || dependencyMetadata.version !== expected.version || hash(dependencyMetadataBytes) !== expected.hash) throw new Error(`dependency pin mismatch: ${name}`);
    packageRoots[name] = root;
    dependencyPins[name] = { version: dependencyMetadata.version, packageJsonSha256: hash(dependencyMetadataBytes), targets: expected.targets };
  }
  const original = {};
  const transformed = {};
  const sourcePins = {};
  sourcePins["package.json"] = hash(await assertSource(packageRoot, "package.json", sourceHashes["package.json"]));
  for (const file of SOURCES) {
    const bytes = await assertSource(packageRoot, file, sourceHashes[file]);
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
    const result = rewriteImports(transformed[file], file, stageRoot, packageRoots, approvedPackages);
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
  const manifest = { schemaVersion: 1, package: { name: "@earendil-works/pi-coding-agent", version }, sourcePins, dependencyPins, outputs, imports, evaluation: "none; transformed SDK source was not imported or evaluated" };
  await mkdir(stageRoot); // exclusive; never clean or traverse an existing stage
  try {
    const files = { "package.json": JSON.stringify({ name: "pi-auth-only-prepared", version, type: "module" }, null, 2) + "\n", ...relocated };
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
