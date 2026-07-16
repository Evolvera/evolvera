#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("../validate-home-asset-provenance.mjs", import.meta.url));
const fixtureDir = mkdtempSync(join(tmpdir(), "home-asset-provenance-"));
const canonicalSource = "https://lucide.dev/icons/arrow-right";
const providedSource = "provided:brand/logo.svg";
const cases = [
  { name: "zero SVG", html: "<main>Text-only preview</main>", shouldPass: true },
  { name: "HTTPS", html: `<SVG\n  DATA-ASSET-SOURCE="${canonicalSource}"></SVG>`, ledger: [canonicalSource], shouldPass: true },
  { name: "provided", html: `<svg data-asset-source="${providedSource}"></svg>`, ledger: [providedSource], shouldPass: true },
  { name: "missing HOME_PLAN", html: `<svg data-asset-source="${providedSource}"></svg>`, shouldPass: false },
  { name: "source absent from ledger", html: '<svg data-asset-source="https://example.invalid/invented-ai-icon.svg"></svg>', ledger: [canonicalSource], shouldPass: false },
  { name: "source outside ledger section", html: `<svg data-asset-source="${providedSource}"></svg>`, plan: `# Home Plan\n\n## Visual System\n- data-asset-source: \`${providedSource}\`\n\n## Asset Provenance Ledger\nNo inline SVG assets authorized.\n`, shouldPass: false },
  { name: "missing ledger section", html: `<svg data-asset-source="${providedSource}"></svg>`, plan: `# Home Plan\n\n## Visual System\n- data-asset-source: \`${providedSource}\`\n`, shouldPass: false },
  { name: "missing source", html: "<svg></svg>", ledger: [providedSource], shouldPass: false },
  { name: "synthetic scheme", html: '<svg data-asset-source="generated:icon"></svg>', ledger: ["generated:icon"], shouldPass: false },
  { name: "synthetic provided label", html: '<svg data-asset-source="provided:generated:icon"></svg>', ledger: ["provided:generated:icon"], shouldPass: false },
  { name: "synthetic custom filename", html: '<svg data-asset-source="provided:custom-logo.svg"></svg>', ledger: ["provided:custom-logo.svg"], shouldPass: false },
  { name: "synthetic AI filename", html: '<svg data-asset-source="provided:ai-generated-icon.svg"></svg>', ledger: ["provided:ai-generated-icon.svg"], shouldPass: false },
  { name: "encoded synthetic filename", html: '<svg data-asset-source="provided:custom&#45;logo.svg"></svg>', ledger: ["provided:custom-logo.svg"], shouldPass: false },
  { name: "encoded provided path", html: '<svg data-asset-source="provided&#58;brand/logo.svg"></svg>', ledger: [providedSource], shouldPass: true },
  { name: "unknown named entity", html: '<svg data-asset-source="provided:brand&hyphen;logo.svg"></svg>', ledger: ["provided:brand-logo.svg"], shouldPass: false },
  { name: "SVG data URI", html: '<svg data-asset-source="data:image/svg+xml;base64,PHN2Zz4="></svg>', ledger: ["data:image/svg+xml;base64,PHN2Zz4="], shouldPass: false },
  { name: "encoded SVG data URI image", html: '<img src="data&#58;image/svg+xml;base64,PHN2Zz4=">', shouldPass: false },
  { name: "CSS escaped SVG data URI", html: '<div style="background-image:url(data\\3a image/svg+xml;base64,PHN2Zz4=)"></div>', shouldPass: false },
  { name: "JS escaped SVG data URI", html: '<script>const src="data\\u003aimage/svg+xml;base64,PHN2Zz4=";</script>', shouldPass: false },
];

try {
  for (const { name, html, ledger, plan, shouldPass } of cases) {
    const caseDir = join(fixtureDir, name.replaceAll(" ", "-"));
    mkdirSync(caseDir, { recursive: true });
    const fixturePath = join(caseDir, "index.html");
    writeFileSync(fixturePath, html);
    if (plan) {
      writeFileSync(join(caseDir, "HOME_PLAN.md"), plan);
    } else if (ledger) {
      const entries = ledger.map((source) => `- data-asset-source: \`${source}\``).join("\n");
      writeFileSync(join(caseDir, "HOME_PLAN.md"), `# Home Plan\n\n## Asset Provenance Ledger\n${entries}\n`);
    }

    let passed = true;
    try {
      execFileSync(process.execPath, [scriptPath, fixturePath], { stdio: "pipe" });
    } catch {
      passed = false;
    }

    if (passed !== shouldPass) {
      throw new Error(`${name}: expected ${shouldPass ? "PASS" : "FAIL"}, received ${passed ? "PASS" : "FAIL"}`);
    }
    console.log(`PASS: ${name}`);
  }
} finally {
  rmSync(fixtureDir, { recursive: true, force: true });
}

console.log("PASS: asset provenance smoke test");
