import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageSuffix = path.join("@earendil-works", "pi-coding-agent");
let globalNpmRoot;
let resolvedGlobalNpmRoot = false;

function installedSdk(root) {
  const packageRoot = path.resolve(root);
  return existsSync(path.join(packageRoot, "package.json")) ? packageRoot : undefined;
}

function getGlobalNpmRoot() {
  if (!resolvedGlobalNpmRoot) {
    resolvedGlobalNpmRoot = true;
    try {
      const npm = process.platform === "win32" ? "npm.cmd" : "npm";
      globalNpmRoot = execFileSync(npm, ["root", "-g"], {
        encoding: "utf8",
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      globalNpmRoot = undefined;
    }
  }
  return globalNpmRoot;
}

export function resolvePiSdkRoot(importMetaUrl) {
  const searched = [];
  const configuredRoot = process.env.PI_SDK_ROOT;
  if (configuredRoot) {
    searched.push(`PI_SDK_ROOT=${configuredRoot}`);
    const sdkRoot = installedSdk(configuredRoot);
    if (sdkRoot) return sdkRoot;
    throw new Error(`PI SDK não encontrado em PI_SDK_ROOT=${configuredRoot}. Procurado: ${searched.join("; ")}.`);
  }

  const npmRoot = getGlobalNpmRoot();
  if (npmRoot) {
    const globalSdk = path.join(npmRoot, packageSuffix);
    searched.push(`npm root -g: ${globalSdk}`);
    const sdkRoot = installedSdk(globalSdk);
    if (sdkRoot) return sdkRoot;
  } else {
    searched.push("npm root -g: comando indisponível ou falhou");
  }

  const smokeDir = path.dirname(fileURLToPath(importMetaUrl));
  for (const levels of [3, 4, 5, 6]) {
    const candidate = path.resolve(smokeDir, "../".repeat(levels), "npm-global", "lib", "node_modules", packageSuffix);
    searched.push(candidate);
    const sdkRoot = installedSdk(candidate);
    if (sdkRoot) return sdkRoot;
  }

  throw new Error(`PI SDK não encontrado. Locais procurados: ${searched.join("; ")}. Configure PI_SDK_ROOT ou instale o pacote no npm global.`);
}

export async function loadJiti(importMetaUrl) {
  const packageRoot = resolvePiSdkRoot(importMetaUrl);
  const jitiUrl = pathToFileURL(path.join(packageRoot, "node_modules", "jiti", "lib", "jiti.mjs")).href;
  return import(jitiUrl);
}
