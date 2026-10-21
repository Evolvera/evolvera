import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadJiti, resolvePiSdkRoot } from "./lib/pi-sdk.mjs";

// Resolve global installations before any test fixture can redirect HOME or USERPROFILE.
const sdkRoot = resolvePiSdkRoot(import.meta.url);
const { createJiti } = await loadJiti(import.meta.url);
const agentHome = process.env.PI_CODING_AGENT_DIR ?? path.join(homedir(), ".pi", "agent");
const packageDist = path.join(agentHome, "npm", "node_modules", "@tintinweb", "pi-subagents", "dist");
const jiti = createJiti(import.meta.url, { alias: { "@earendil-works/pi-coding-agent": path.join(sdkRoot, "dist/index.js") } });
const { extensionCanonicalNames, parseExtensionsSpec } = await jiti.import(path.join(packageDist, "agent-runner.js"));
const { parseAgentFrontmatter } = await jiti.import(path.join(packageDist, "custom-agents.js"));
const temp = mkdtempSync(path.join(tmpdir(), "orca-subagent-extension-exclusion-"));

function parseAgent(extensions) {
  const content = `---\nname: test-agent\nextensions: ${extensions}\nexclude_extensions: [orca-agent-status, orca-titlebar-spinner]\n---\n`;
  return parseAgentFrontmatter(content).frontmatter;
}

function loadedExtensions(files, config) {
  const spec = Array.isArray(config.extensions)
    ? parseExtensionsSpec(config.extensions, temp)
    : { names: new Set(), wildcard: false };
  return files.filter((file) => {
    const names = extensionCanonicalNames(file);
    const included = config.extensions === true || spec.wildcard || names.some((name) => spec.names.has(name));
    const excluded = (config.exclude_extensions ?? []).some((name) => names.includes(name.toLowerCase()));
    return included && !excluded;
  });
}

try {
  const extensionDir = path.join(temp, "extensions");
  mkdirSync(extensionDir);
  for (const name of ["orca-agent-status", "orca-titlebar-spinner", "other-extension"]) {
    writeFileSync(path.join(extensionDir, `${name}.ts`), "// fixture\n");
  }
  const files = ["orca-agent-status.ts", "orca-titlebar-spinner.ts", "other-extension.ts"]
    .map((file) => path.join(extensionDir, file));

  assert.deepEqual(extensionCanonicalNames(files[0]), ["orca-agent-status"]);
  assert.deepEqual(extensionCanonicalNames(files[1]), ["orca-titlebar-spinner"]);
  assert.deepEqual(loadedExtensions(files, parseAgent("true")), [files[2]], "all-extensions agent loads other extensions only");

  const explicitAllowlist = { extensions: ["other-extension"] };
  assert.deepEqual(parseExtensionsSpec(explicitAllowlist.extensions, temp).names, new Set(["other-extension"]));
  assert.deepEqual(loadedExtensions(files, explicitAllowlist), [files[2]], "explicit allowlist remains unchanged");
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log("orca subagent extension exclusion smoke: PASS");
