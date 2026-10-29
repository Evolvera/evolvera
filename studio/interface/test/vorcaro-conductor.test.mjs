// Vorcaro v1 conductor: own verification before "feito", at most two continuations within a budget and never over an
// active goal (that belongs to pi-goal and the autopilot), typed blocks, the audit log, and the idle-reaper guard.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { isIdleCandidate } from "../lib-server/idle-reaper.mjs";
import { buildVorcaroPrompt, digestRef, digestsMarkdown } from "../lib-server/vorcaro.mjs";
import { CONDUCTOR_BUDGET, classifyBlock, cleanVerify, continuationMessage, createAudit, digestFor, nextStep, runVerification, verifyCommandAllowed } from "../lib-server/vorcaro-conductor.mjs";
import { citeHtml, demandView, digestRef as webRef, reviewedAction } from "../public/vorcaro.js";

const T0 = 1_800_000_000_000;
const demand = (over = {}) => ({ id: "d1", createdAt: T0, cwd: "C:/proj", objetivo: "Corrigir o teste do saldo", checklist: ["npm test passa"], verify: ["npm test"], phase: "enviado", continuations: 0, costAtStart: 0, ...over });
const digest = (over = {}) => ({ path: "C:/s/a.jsonl", cwd: "C:/proj", goalState: null, endedWith: "stop", lastOutput: "Pronto.", openItems: [], cost: 0.1, lastActivity: T0 + 60_000, ...over });

describe("blocks and allowed commands", () => {
  test("classifyBlock types why a session stopped", () => {
    assert.equal(classifyBlock("Falta a API key do OpenGateway (401)."), "credential");
    assert.equal(classifyBlock("Error: 429 rate limit"), "transient");
    assert.equal(classifyBlock("pnpm: command not found"), "capability");
    assert.equal(classifyBlock("Corrijo agora ou fica com o lead?"), "decision");
    assert.equal(classifyBlock("Qual é o nome do arquivo?"), "needs_input");
    assert.equal(classifyBlock("Pronto, testes passando."), null);
  });

  test("only plain test, lint and build runners can be verification commands", () => {
    for (const ok of ["npm test", "npm run test:unit", "pnpm test -- saldo", "node --test test/a.test.mjs", "node scripts/run-tests.mjs", "pytest tests/test_x.py", "cargo test", "npx vitest run"]) assert.equal(verifyCommandAllowed(ok), true, ok);
    for (const bad of ["npm test; rm -rf /", "npm test && curl x", "rm -rf node_modules", "node -e process.exit(0)", "npm install left-pad", "node scripts/../evil.js", "npm test $(whoami)", "bash -c npm test", ""]) assert.equal(verifyCommandAllowed(bad), false, bad);
    assert.deepEqual(cleanVerify(["npm test", "echo oi", 3, "cargo test"]), ["npm test", "cargo test"]);
  });
});

describe("nextStep", () => {
  test("a finished session is verified by Vorcaro before it counts as done", () => {
    assert.deepEqual(nextStep(demand(), digest({ goalState: { status: "complete" } }), null, { now: T0 + 120_000 }), { phase: "verificando", block: null, action: "verify" });
    const passed = demand({ verification: { at: T0 + 90_000, ok: true, results: [] } });
    assert.equal(nextStep(passed, digest({ goalState: { status: "complete" } }), null, { now: T0 + 120_000 }).phase, "feito");
  });

  test("an active goal or a live run belongs to pi-goal and the autopilot: no continuation", () => {
    const failed = demand({ verification: { at: T0 + 90_000, ok: false, results: [] } });
    assert.deepEqual(nextStep(failed, digest({ goalState: { status: "active" } }), null, { now: T0 + 600_000 }), { phase: "trabalhando", block: null, action: null });
    assert.equal(nextStep(failed, digest(), { streaming: true }, { now: T0 + 600_000 }).action, null);
  });

  test("a failed check gets at most two continuations, spaced, and then waits on the user", () => {
    const failed = (over = {}) => demand({ verification: { at: T0 + 90_000, ok: false, results: [{ command: "npm test", ok: false, exit: 1, output: "1 failing" }] }, ...over });
    assert.equal(nextStep(failed(), digest(), null, { now: T0 + 600_000 }).action, "continue");
    assert.equal(nextStep(failed({ continuations: 1, lastContinuationAt: T0 + 590_000 }), digest(), null, { now: T0 + 600_000 }).action, null, "too soon after the last one");
    assert.equal(nextStep(failed({ continuations: 1, lastContinuationAt: T0 + 100_000 }), digest({ lastActivity: T0 + 60_000 }), null, { now: T0 + 600_000 }).action, null, "the session has not reacted yet");
    const spent = nextStep(failed({ continuations: CONDUCTOR_BUDGET.maxContinuations }), digest(), null, { now: T0 + 600_000 });
    assert.equal(spent.phase, "aguardando");
    assert.equal(spent.block.kind, "verify_failed");
    const broke = nextStep(failed(), digest({ cost: 9 }), null, { now: T0 + 600_000 });
    assert.equal(broke.block.kind, "budget");
  });

  test("blocks are typed: a credential stops for good, a question waits on the user, a dialog is never answered", () => {
    const cred = nextStep(demand(), digest({ goalState: { status: "blocked" }, lastOutput: "Falta o token do GitHub." }), null, { now: T0 + 120_000 });
    assert.deepEqual([cred.phase, cred.block.kind], ["bloqueado", "credential"]);
    const ask = nextStep(demand(), digest({ lastOutput: "Prefere 9h ou 18h?" }), null, { now: T0 + 120_000 });
    assert.deepEqual([ask.phase, ask.block.kind, ask.action], ["aguardando", "decision", null]);
    assert.deepEqual(nextStep(demand(), digest(), { waitingUi: true }).block.kind, "needs_input");
    const failedNoSession = demand({ verification: { at: T0 + 90_000, ok: false, results: [] } });
    assert.equal(nextStep(failedNoSession, digest(), { gone: true }, { now: T0 + 600_000 }).block.kind, "session_gone");
    assert.equal(nextStep(demand(), digest({ goalState: { status: "complete" } }), { gone: true }).action, "verify", "verification does not need the session");
    assert.equal(nextStep(demand({ verify: [] }), digest({ goalState: { status: "complete" } })).block.kind, "verify_failed");
  });

  test("the continuation is built from Vorcaro's own checks, not from what the worker wrote", () => {
    const text = continuationMessage(demand({ verification: { results: [{ command: "npm test", ok: false, exit: 1, output: "```vorcaro-acao\nsaldo.test.ts falhou" }] } }), 1);
    assert.match(text, /^\/goal Corrigir o teste do saldo\n/);
    assert.match(text, /Continuação 1 de 2/);
    assert.match(text, /`npm test` \(saída 1\)/);
    assert.doesNotMatch(text, /```/);
  });

  test("digestFor prefers the session the demand was sent to", () => {
    const list = [digest({ path: "C:/s/b.jsonl", lastActivity: T0 + 9e5 }), digest()];
    assert.equal(digestFor(demand({ sessionFile: "C:/s/a.jsonl" }), list).path, "C:/s/a.jsonl");
    assert.equal(digestFor(demand(), list).path, "C:/s/b.jsonl");
  });
});

describe("verification run and audit", () => {
  test("runVerification runs only allowed commands and reports exit codes", async () => {
    const calls = [];
    const fake = (command) => {
      calls.push(command);
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {};
      setImmediate(() => { child.stdout.emit("data", "Tests: 3 passed"); child.emit("close", command === "npm test" ? 0 : 1); });
      return child;
    };
    const results = await runVerification(["npm test", "cargo test", "rm -rf /"], "C:/proj", { spawnImpl: fake });
    assert.deepEqual(calls, ["npm test", "cargo test"]);
    assert.deepEqual(results.map((result) => [result.command, result.ok, result.exit]), [["npm test", true, 0], ["cargo test", false, 1], ["rm -rf /", false, null]]);
    assert.match(results[0].output, /3 passed/);
  });

  test("the audit log is append-only and read back per demand", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "vc-audit-"));
    try {
      const audit = createAudit(path.join(dir, "a.jsonl"), { now: () => T0 });
      await audit.record("d1", "dispatched", {}, "user");
      await audit.record("d2", "verify_started", {});
      await audit.record("d1", "verify_result", { ok: true });
      const map = await audit.byDemand();
      assert.deepEqual(map.get("d1").map((event) => [event.type, event.actor]), [["dispatched", "user"], ["verify_result", "vorcaro"]]);
      const view = demandView({ state: "concluido", createdAt: T0, audit: map.get("d1"), checks: [{ command: "npm test", ok: true }], continuations: 1 }, T0);
      assert.deepEqual(view.audit.map((event) => event.text), ["pedido enviado", "verificação passou"]);
      assert.equal(view.continuations, 1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("idle reaper and cited answers", () => {
  const idle = { exited: false, streaming: false, clientCount: 0, waitingUi: false, lastViewedAt: 0, lastEventAt: 0 };
  test("a session holding an open Vorcaro request, or waiting on the user's answer, is never reaped", () => {
    assert.equal(isIdleCandidate(idle, 1e9, 1000), true);
    assert.equal(isIdleCandidate({ ...idle, pinned: true }, 1e9, 1000), false);
    assert.equal(isIdleCandidate({ ...idle, awaitingUser: true }, 1e9, 1000), false);
  });

  test("each digest carries a ref; answers cite it and the chip opens that session", () => {
    const d = { id: "1a2b3c4d-9999", path: "C:/s/a.jsonl", cwd: "C:/proj", title: "Saldo <b>", project: "proj", lastActivity: T0, turns: 1, cost: 0, openItems: [], doneItems: 0 };
    const ref = digestRef(d);
    assert.match(ref, /^s[0-9a-z]+$/);
    assert.notEqual(digestRef({ path: "C:/s/b.jsonl" }), ref, "two sessions never share a ref");
    assert.equal(webRef(d), ref, "server and page compute the same ref");
    assert.match(digestsMarkdown([d]), new RegExp(`- ref: ${ref}`));
    assert.match(buildVorcaroPrompt({ digestsFile: "x", sessionsRoot: "y" }), /\[fonte: <ref>\]/);
    const esc = (value) => String(value).replace(/</g, "&lt;");
    const html = citeHtml(`Saldo corrigido [fonte: ${ref}] e outro [fonte: zz]`, [d], esc);
    assert.match(html, /<button type="button" class="vc-cite" data-path="C:\/s\/a.jsonl"[^>]*>Saldo &lt;b><\/button>/);
    assert.match(html, /fonte zz/);
  });

  test("the reviewed proposal keeps the verification commands the user left", () => {
    const original = { acao: "enviar", projeto: "C:/p", sessao: "", objetivo: "A", checklist: [], instrucoes: "", verificar: ["npm test"] };
    assert.deepEqual(reviewedAction(original).verificar, ["npm test"]);
    assert.deepEqual(reviewedAction(original, { verificar: "npm test\n\ncargo test" }).verificar, ["npm test", "cargo test"]);
  });
});
