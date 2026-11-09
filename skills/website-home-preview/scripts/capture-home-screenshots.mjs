#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { captureWithObscura, resolveObscura } from "./lib/obscura-capture.mjs";

// Pinned deliberately: a floating Playwright tag resolves a new browser build on
// every upstream release, which silently re-downloads ~100 MB per drift and can
// change the captured pixels between two runs of the same page.
const PLAYWRIGHT_VERSION = "1.63.0";
const ENGINES = new Set(["auto", "obscura", "chromium"]);

const [indexArg, outArg] = process.argv.slice(2);

if (!indexArg) {
  console.error("Usage: node capture-home-screenshots.mjs <path/to/index.html> [output-dir]");
  process.exit(2);
}

const indexPath = path.resolve(indexArg);
if (!fs.existsSync(indexPath)) {
  console.error(`index.html not found: ${indexPath}`);
  process.exit(2);
}

const requestedEngine = (process.env.PI_BROWSER || "auto").trim().toLowerCase();
if (!ENGINES.has(requestedEngine)) {
  console.error(`Unknown PI_BROWSER "${requestedEngine}". Use auto, obscura, or chromium.`);
  process.exit(2);
}

const outputDir = path.resolve(outArg || path.join(path.dirname(indexPath), "screenshots"));
fs.mkdirSync(outputDir, { recursive: true });

const pageUrl = pathToFileURL(indexPath).href;
const shots = [
  { name: "portrait", viewport: "390,844", width: 390, height: 844, file: path.join(outputDir, "portrait.png") },
  { name: "landscape", viewport: "1440,900", width: 1440, height: 900, file: path.join(outputDir, "landscape.png") },
];

function runPlaywright(args) {
  return spawnSync("npx", ["--yes", `playwright@${PLAYWRIGHT_VERSION}`, ...args], {
    stdio: "inherit",
    env: process.env,
  });
}

function captureWithChromium() {
  for (const shot of shots) {
    const args = [
      "screenshot",
      "--browser=chromium",
      `--viewport-size=${shot.viewport}`,
      "--full-page",
      pageUrl,
      shot.file,
    ];

    let result = runPlaywright(args);
    if (result.status === 0) continue;

    console.warn(`Chromium capture failed for ${shot.name}. Installing Chromium ${PLAYWRIGHT_VERSION} and retrying once...`);
    const install = runPlaywright(["install", "chromium"]);
    if (install.status !== 0) process.exit(install.status || 1);

    result = runPlaywright(args);
    if (result.status !== 0) process.exit(result.status || 1);
  }
  return { engine: "chromium", detail: `playwright ${PLAYWRIGHT_VERSION}` };
}

async function captureWithObscuraEngine(obscuraPath) {
  const { version } = await captureWithObscura({ obscuraPath, pageUrl, shots });
  return { engine: "obscura", detail: version ? `${version}` : undefined };
}

async function main() {
  let capture;
  let fallbackReason;

  if (requestedEngine !== "chromium") {
    const obscuraPath = resolveObscura();
    if (obscuraPath) {
      try {
        capture = await captureWithObscuraEngine(obscuraPath);
      } catch (error) {
        fallbackReason = error instanceof Error ? error.message : String(error);
        if (requestedEngine === "obscura") {
          console.error(`Obscura capture failed: ${fallbackReason}`);
          process.exit(1);
        }
        console.warn(`Obscura capture failed (${fallbackReason}). Falling back to Chromium.`);
      }
    } else if (requestedEngine === "obscura") {
      console.error("PI_BROWSER=obscura requested, but no obscura binary was found on PATH or in ~/.pi/agent/bin.");
      process.exit(1);
    }
  }

  if (!capture) capture = captureWithChromium();

  const snapshotMd = path.join(outputDir, "VISUAL_SNAPSHOT.md");
  const rel = (p) => path.relative(process.cwd(), p) || path.basename(p);
  fs.writeFileSync(
    snapshotMd,
    `# Visual Snapshot\n\n` +
      `- Source: \`${rel(indexPath)}\`\n` +
      `- Captured: ${new Date().toISOString()}\n` +
      `- Engine: \`${capture.engine}\`${capture.detail ? ` (${capture.detail})` : ""}\n` +
      (fallbackReason ? `- Fallback reason: ${fallbackReason}\n` : "") +
      `- Portrait: \`${rel(shots[0].file)}\` — viewport 390x844, full page\n` +
      `- Landscape: \`${rel(shots[1].file)}\` — viewport 1440x900, full page\n` +
      (capture.engine === "obscura"
        ? `- Note: Obscura is a non-Chromium rendering engine. Use \`PI_BROWSER=chromium\` for final visual approval.\n`
        : ""),
  );

  console.log(`Captured Home preview screenshots:\n- ${rel(shots[0].file)}\n- ${rel(shots[1].file)}\n- ${rel(snapshotMd)}`);
}

await main();