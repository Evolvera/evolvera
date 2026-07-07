#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

const outputDir = path.resolve(outArg || path.join(path.dirname(indexPath), "screenshots"));
fs.mkdirSync(outputDir, { recursive: true });

const pageUrl = pathToFileURL(indexPath).href;
const shots = [
  { name: "portrait", viewport: "390,844", file: path.join(outputDir, "portrait.png") },
  { name: "landscape", viewport: "1440,900", file: path.join(outputDir, "landscape.png") },
];

function runPlaywright(args) {
  return spawnSync("npx", ["--yes", "playwright@latest", ...args], {
    stdio: "inherit",
    env: process.env,
  });
}

function captureShot(shot) {
  const args = [
    "screenshot",
    "--browser=chromium",
    `--viewport-size=${shot.viewport}`,
    "--full-page",
    pageUrl,
    shot.file,
  ];

  let result = runPlaywright(args);
  if (result.status === 0) return;

  console.warn(`Initial screenshot capture failed for ${shot.name}. Installing Chromium and retrying once...`);
  const install = runPlaywright(["install", "chromium"]);
  if (install.status !== 0) process.exit(install.status || 1);

  result = runPlaywright(args);
  if (result.status !== 0) process.exit(result.status || 1);
}

for (const shot of shots) captureShot(shot);

const snapshotMd = path.join(outputDir, "VISUAL_SNAPSHOT.md");
const rel = (p) => path.relative(process.cwd(), p) || path.basename(p);
fs.writeFileSync(
  snapshotMd,
  `# Visual Snapshot\n\n` +
    `- Source: \`${rel(indexPath)}\`\n` +
    `- Captured: ${new Date().toISOString()}\n` +
    `- Portrait: \`${rel(shots[0].file)}\` — viewport 390x844, full page\n` +
    `- Landscape: \`${rel(shots[1].file)}\` — viewport 1440x900, full page\n`,
);

console.log(`Captured Home preview screenshots:\n- ${rel(shots[0].file)}\n- ${rel(shots[1].file)}\n- ${rel(snapshotMd)}`);
