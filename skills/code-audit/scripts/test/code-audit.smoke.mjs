#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const prepareScript = fileURLToPath(new URL("../prepare-audit-workspace.mjs", import.meta.url));
const verifyScript = fileURLToPath(new URL("../verify-source-unchanged.mjs", import.meta.url));
const validateScript = fileURLToPath(new URL("../validate-audit-report.mjs", import.meta.url));
const harnessRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const fixtureRoot = mkdtempSync(join(tmpdir(), "pi-code-audit-smoke-"));
const source = join(fixtureRoot, "source");
const auditRunRoots = [];
const git = (args, options = {}) => execFileSync("git", ["-C", options.cwd ?? source, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" } });
const harnessBefore = git(["status", "--porcelain=v1", "--untracked-files=all"], { cwd: harnessRoot });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const runNode = (script, args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", stdio: "pipe" });

function reportData(defects = []) {
  const evidence = [{ id: "EVD-001", kind: "source", location: "src/a.js:1", sha256: "a".repeat(64) }];
  return {
    schemaVersion: "1.0",
    audit: { runId: "AUDIT-SMOKE", target: source, targetHead: "fixture-head", sourceSha256: "b".repeat(64), objective: "Verify report validation.", mode: "focused", status: "COMPLETE", sourceIntegrity: "PASS" },
    summary: { proven: defects.length, unverified: 0, disproven: 0, evidence: evidence.length, perspectives: 1 },
    perspectives: [{ id: "PER-001", name: "Contract", rationale: "Public behavior is material.", status: "complete" }],
    defects, unverifiedCandidates: [], disprovenCandidates: [], evidence,
    limitations: ["Selected content and static evidence cannot establish absolute certainty."],
  };
}
function goodFinding() {
  return {
    id: "AUD-001", classification: "PROVEN", severity: "HIGH", confidence: "HIGH", title: "Contract mismatch",
    location: "src/a.js:1", contract: "The function must return one.", reachability: "Called by the tracked entry point.",
    proof: "Deterministic source evaluation shows zero is returned.", expected: "Return value 1.", observed: "Return value 0.",
    impact: "Callers receive the wrong state.", counterevidence: "No alternate implementation or guard exists.",
    smallestFix: "Return the contracted value.", evidenceRefs: ["EVD-001"],
  };
}
function renderReport(data) {
  const findingHtml = data.defects.map((item) => `<article class="finding" id="${item.id}"><h3>${item.title}</h3></article>`).join("") || '<div class="empty">No proven defects.</div>';
  const sections = [
    ["run-integrity", '<div data-integrity="PASS">PASS</div>'],
    ["executive-summary", `<div data-count="proven" data-value="${data.summary.proven}"></div><div data-count="unverified" data-value="${data.summary.unverified}"></div><div data-count="disproven" data-value="${data.summary.disproven}"></div><div data-count="evidence" data-value="${data.summary.evidence}"></div>`],
    ["system-objective", "Objective"], ["audit-scope", "Scope"],
    ["perspectives", `<div data-count="perspectives" data-value="${data.summary.perspectives}">Perspective</div>`],
    ["proven-defects", findingHtml], ["unverified-candidates", '<div class="empty">None</div>'],
    ["disproven-candidates", '<div class="empty">None</div>'], ["evidence-ledger", "EVD-001"],
    ["coverage-gaps", "Runtime not exercised."], ["run-manifest", "Manifest"], ["limitations", "No absolute certainty."],
  ].map(([id, body]) => `<section id="${id}"><h2>${id}</h2>${body}</section>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="description" content="Audit"><title>Code Audit Report</title><style>body{font-family:system-ui}</style></head><body><nav aria-label="Report"><a href="#run-integrity">Integrity</a></nav><main>${sections}</main><script type="application/json" id="audit-data">${JSON.stringify(data).replaceAll("<", "\\u003c")}</script></body></html>`;
}

try {
  mkdirSync(source);
  git(["init", "-q"]);
  writeFileSync(join(source, "tracked.txt"), "tracked\n");
  writeFileSync(join(source, "linked-target.txt"), "link target\n");
  symlinkSync("linked-target.txt", join(source, "tracked-link"));
  git(["add", "tracked.txt", "linked-target.txt", "tracked-link"]);
  git(["-c", "user.name=PI Smoke", "-c", "user.email=pi-smoke@example.invalid", "commit", "-qm", "fixture"]);
  writeFileSync(join(source, "untracked.txt"), "untracked\n");

  const prepared = runNode(prepareScript, [source]);
  assert(prepared.status === 0, `prepare failed: ${prepared.stderr}`);
  const result = JSON.parse(prepared.stdout.trim());
  auditRunRoots.push(result.runRoot);
  const manifest = JSON.parse(readFileSync(result.manifest, "utf8"));
  assert(result.runRoot.startsWith(`${tmpdir()}/`) || result.runRoot.startsWith(`${tmpdir()}\\`), "run root is not under OS temp");
  assert(manifest.membershipSha256 === manifest.mirrorSha256, "baseline source/mirror hashes differ");
  assert(existsSync(manifest.paths.proof), "proof workspace root was not created");
  assert(manifest.files.some((item) => item.path === "tracked.txt"), "tracked regular file was not copied");
  assert(!manifest.files.some((item) => item.path === "untracked.txt"), "untracked file was copied by default");
  assert(manifest.skippedSymlinks.some((item) => item.path === "tracked-link"), "tracked symlink was not recorded as skipped");
  assert(!existsSync(join(result.mirror, ".git")), "mirror unexpectedly contains .git");

  const preparedWithUntracked = runNode(prepareScript, ["--include-untracked", source]);
  assert(preparedWithUntracked.status === 0, `prepare --include-untracked failed: ${preparedWithUntracked.stderr}`);
  const untrackedResult = JSON.parse(preparedWithUntracked.stdout.trim());
  auditRunRoots.push(untrackedResult.runRoot);
  const untrackedManifest = JSON.parse(readFileSync(untrackedResult.manifest, "utf8"));
  assert(untrackedManifest.includeUntracked === true, "include-untracked mode was not recorded");
  assert(untrackedManifest.files.some((item) => item.path === "untracked.txt" && item.origin === "untracked"), "approved untracked file was not copied");

  writeFileSync(join(result.mirror, "tracked.txt"), "mirror mutation\n");
  const integrityPass = runNode(verifyScript, [result.manifest]);
  assert(integrityPass.status === 0, `mirror mutation affected source integrity: ${integrityPass.stderr}`);

  writeFileSync(join(source, "tracked.txt"), "source mutation\n");
  const integrityFail = runNode(verifyScript, [result.manifest]);
  assert(integrityFail.status !== 0 && integrityFail.stderr.includes("INTEGRITY_FAILURE"), "source mutation did not produce INTEGRITY_FAILURE");
  writeFileSync(join(source, "tracked.txt"), "tracked\n");

  const reportDir = join(fixtureRoot, "reports");
  mkdirSync(reportDir);
  const goodPath = join(reportDir, "good.html");
  writeFileSync(goodPath, renderReport(reportData([goodFinding()])));
  assert(runNode(validateScript, [goodPath]).status === 0, "minimal good report was rejected");

  const cases = [
    ["unresolved", renderReport(reportData()).replace("Objective", "{{OBJECTIVE}}")],
    ["external", renderReport(reportData()).replace("<main>", '<img src="https://example.invalid/x.png"><main>')],
    ["count-mismatch", renderReport({ ...reportData(), summary: { ...reportData().summary, proven: 1 } })],
    ["missing-proof", renderReport(reportData([{ ...goodFinding(), proof: "" }]))],
  ];
  for (const [name, html] of cases) {
    const path = join(reportDir, `${name}.html`);
    writeFileSync(path, html);
    assert(runNode(validateScript, [path]).status !== 0, `${name} report was incorrectly accepted`);
  }

  const harnessAfter = git(["status", "--porcelain=v1", "--untracked-files=all"], { cwd: harnessRoot });
  assert(harnessAfter === harnessBefore, "smoke run created or changed files in the harness repository");
  console.log("PASS: code-audit workspace, integrity, and report smoke test");
} finally {
  for (const runRoot of auditRunRoots) rmSync(runRoot, { recursive: true, force: true });
  rmSync(fixtureRoot, { recursive: true, force: true });
}
