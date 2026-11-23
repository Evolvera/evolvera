import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { Type } from "typebox";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Delivery gate: opt-in through `<agentDir>/delivery-gate.json` (`{ "enabled": true }`).
 * While a delivery is active the session does not settle until every gate has proof. A proof is bound to
 * a content fingerprint of the project, so changing code expires it. The review gate only accepts a
 * verdict from another PI session. An Orca automation, created with the delivery and removed with it,
 * resumes a delivery whose session died; its precheck keeps idle runs from calling a model.
 */

export type DeliveryConfig = {
  enabled: boolean;
  watch: boolean;
  watchCron: string;
  maxTurns: number;
  maxStalls: number;
  checks: { name: string; command: string; ui?: boolean }[];
};
export type Proof = { ok: boolean; at?: string; code?: string; detail?: string };
export type Delivery = {
  id: string; title: string; session: string; project: string; base: string; ui: boolean;
  status: "active" | "waiting" | "asking" | "stalled" | "ready" | "done" | "cancelled";
  touchedAt: number; waitUntil?: number; reason?: string; turns: number; stalls: number; signature?: string;
  automation?: string; watchNote?: string; proofs: Record<string, Proof>;
};
type Output = { code: number; text: string };

export const DEFAULT_CONFIG: DeliveryConfig = { enabled: false, watch: true, watchCron: "*/30 * * * *", maxTurns: 80, maxStalls: 8, checks: [] };
const OPEN = ["active", "waiting", "asking", "stalled"];
const EXTERNAL = ["review", "ci"];
const CONTENT_FREE = ["spec", "docs"];
const PRINTS: [string, RegExp][] = [["mobile", /mobile|390/i], ["tablet", /tablet|768/i], ["desktop", /desktop|1280|1366|1440/i], ["wide", /wide|1920/i], ["dark", /dark/i]];
const HELP: Record<string, string> = {
  spec: "write spec.md in the delivery folder (goal, scope, out of scope, acceptance criteria), then prove gate=spec",
  quality: "prove gate=quality command=<build, lint and type check of the project>",
  tests: "prove gate=tests command=<test suite, including the new tests>",
  docs: "update README, CHANGELOG or docs, then prove gate=docs",
  browser: "use the real flow in a browser, save mobile, tablet, desktop, wide and dark screenshots in prints/, then prove gate=browser command=<end-to-end test>",
  review: "ask an independent PI session to review and record verdict=approved|rejected for this id, then action=wait",
  ci: "commit, push, open the PR and prove gate=ci pr=<number or link>; while checks run, action=wait",
};

const root = () => join(getAgentDir(), "deliveries");
const folder = (id: string) => join(root(), id);
const file = (id: string) => join(folder(id), "state.json");
const reply = (text: string) => ({ content: [{ type: "text" as const, text }], details: {} });

export function readConfig(path = join(getAgentDir(), "delivery-gate.json")): DeliveryConfig {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(path, "utf8")) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function isFakeCommand(command: string): boolean {
  const text = command.trim();
  return text.length < 4 || /^(true|:|exit 0|echo\b|printf\b)/.test(text) || /\|\|\s*(true|:|exit 0|echo\b)/.test(text);
}

export function showsTests(output: string): boolean {
  return /\b[1-9]\d*\s+(passed|passing|pass|tests?|ok)\b|\bpass(ed)?[^\d\n]{0,4}[1-9]|\btests?[^\d\n]{0,4}[1-9]/i.test(output);
}

export function isCancelRequest(text: string): boolean {
  if (/\b(do not|don't|n[aã]o)\s+(cancel|stop|drop)/i.test(text) || /msg_[0-9a-f]{6}/i.test(text)) return false;
  return /\b(cancel|cancela|cancele|cancelar|drop|abandon)\b/i.test(text);
}

export function requiredGates(delivery: Pick<Delivery, "ui">, github: boolean, config: DeliveryConfig): string[] {
  const extra = config.checks.filter((check) => !check.ui || delivery.ui).map((check) => check.name);
  return ["spec", "quality", "tests", "docs", ...(delivery.ui ? ["browser"] : []), ...extra, "review", ...(github ? ["ci"] : [])];
}

export function missingGates(delivery: Pick<Delivery, "proofs">, required: string[], code: string): string[] {
  return required.filter((gate) => {
    const proof = delivery.proofs[gate];
    return !proof?.ok || (!CONTENT_FREE.includes(gate) && proof.code !== code);
  });
}

export function advanceTurn(delivery: Delivery, signature: string, config: DeliveryConfig): void {
  delivery.stalls = signature === delivery.signature ? delivery.stalls + 1 : 0;
  delivery.signature = signature;
  delivery.turns += 1;
  if (delivery.turns >= config.maxTurns || delivery.stalls >= config.maxStalls) {
    delivery.status = "stalled";
    delivery.reason = delivery.turns >= config.maxTurns ? "turn limit" : "no progress";
  }
}

export function needsWake(delivery: Pick<Delivery, "status" | "touchedAt" | "waitUntil">, now: number, idleMs = 20 * 60_000): boolean {
  if (delivery.status === "active") return now - delivery.touchedAt > idleMs;
  return delivery.status === "waiting" && now > (delivery.waitUntil ?? 0);
}

const WATCH_SCRIPT = `import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const needsWake = ${needsWake.toString()};
try {
  const state = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), process.argv[2], "state.json"), "utf8"));
  process.exit(needsWake(state, Date.now()) ? 0 : 1);
} catch { process.exit(1); }
`;

export function watchScript(): string {
  return WATCH_SCRIPT;
}

function shell(pi: ExtensionAPI | undefined): string {
  const configured = (pi as any)?.getSettings?.()?.shellPath;
  return typeof configured === "string" && existsSync(configured) ? configured : "bash";
}

export function run(command: string, cwd: string, options: { shell?: string; env?: Record<string, string>; minutes?: number; signal?: AbortSignal } = {}): Promise<Output> {
  return new Promise((done) => {
    const child = spawn(options.shell ?? "bash", ["-c", command], { cwd, env: { ...process.env, ...options.env }, windowsHide: true, detached: process.platform !== "win32" });
    let text = "";
    const collect = (chunk: Buffer) => { text = (text + chunk.toString("utf8")).slice(-200_000); };
    const stop = () => {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
      else try { process.kill(-child.pid!, "SIGKILL"); } catch { child.kill("SIGKILL"); }
    };
    const timer = setTimeout(() => { text += "\n[timed out]"; stop(); }, (options.minutes ?? 20) * 60_000);
    options.signal?.addEventListener("abort", stop, { once: true });
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error) => { clearTimeout(timer); done({ code: 1, text: String(error) }); });
    child.on("close", (code) => { clearTimeout(timer); done({ code: code ?? 1, text }); });
  });
}

export async function fingerprint(project: string, sh = "bash"): Promise<string> {
  const scratch = mkdtempSync(join(tmpdir(), "delivery-gate-"));
  try {
    const listing = await run("git read-tree HEAD 2>/dev/null; git add -A . 2>/dev/null; git ls-files -s 2>/dev/null | grep -viE '\\.mdx?$'", project, { shell: sh, env: { GIT_INDEX_FILE: join(scratch, "index") }, minutes: 5 });
    return createHash("sha256").update(listing.text).digest("hex").slice(0, 16);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function save(delivery: Delivery): void {
  mkdirSync(folder(delivery.id), { recursive: true });
  delivery.touchedAt = Date.now();
  const temporary = `${file(delivery.id)}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(delivery, null, 2));
  renameSync(temporary, file(delivery.id));
}

export function load(id: string): Delivery | undefined {
  if (!/^[\w-]+$/.test(id)) return undefined;
  try {
    return JSON.parse(readFileSync(file(id), "utf8"));
  } catch {
    return undefined;
  }
}

export function change(id: string, apply: (delivery: Delivery) => void): Delivery {
  const delivery = load(id);
  if (!delivery) throw new Error(`delivery ${id} is unreadable`);
  apply(delivery);
  save(delivery);
  return delivery;
}

function all(): Delivery[] {
  return existsSync(root()) ? readdirSync(root()).map(load).filter((entry): entry is Delivery => !!entry) : [];
}

function lastUserText(ctx: any): string {
  for (const entry of [...ctx.sessionManager.getBranch()].reverse()) {
    if (entry?.type !== "message" || entry.message?.role !== "user") continue;
    const content = entry.message.content;
    return typeof content === "string" ? content : (content ?? []).map((part: any) => part.text ?? "").join(" ");
  }
  return "";
}

export default function deliveryGate(pi: ExtensionAPI): void {
  const config = readConfig();
  if (!config.enabled) return;
  const sh = () => shell(pi);
  const git = (command: string, project: string) => run(command, project, { shell: sh(), minutes: 2 });
  const onGithub = async (project: string) => /github\.com/.test((await git("git remote -v", project)).text);
  const session = (ctx: any) => String(ctx.sessionManager.getSessionId());
  const mine = (ctx: any, statuses = OPEN) => all().find((entry) => entry.session === session(ctx) && statuses.includes(entry.status));

  const pending = async (delivery: Delivery) => {
    const github = await onGithub(delivery.project);
    const missing = missingGates(delivery, requiredGates(delivery, github, config), await fingerprint(delivery.project, sh()));
    if (github && !missing.includes("ci") && (await git("git status --porcelain", delivery.project)).text.trim()) missing.push("ci");
    return missing;
  };

  const summary = (delivery: Delivery, missing: string[]) => [
    `Delivery ${delivery.id}: ${delivery.title} [${delivery.status}]`,
    `Folder: ${folder(delivery.id)}`,
    ...(delivery.watchNote ? [`Orca watch: ${delivery.watchNote}`] : []),
    ...missing.map((gate) => {
      const check = config.checks.find((entry) => entry.name === gate);
      const detail = delivery.proofs[gate]?.ok ? "expired: the project changed after this proof" : delivery.proofs[gate]?.detail;
      return `- MISSING ${gate}: ${check ? `prove gate=${gate} (runs ${check.command})` : HELP[gate]}${detail ? ` (${detail.slice(0, 300)})` : ""}`;
    }),
    missing.length ? "" : "Every gate passed. Call action=finish.",
  ].join("\n");

  const startWatch = async (delivery: Delivery) => {
    if (!config.watch) return;
    mkdirSync(root(), { recursive: true });
    writeFileSync(join(root(), "watch.mjs"), watchScript());
    const prompt = `Resume delivery ${delivery.id}: call the delivery tool with action=resume id=${delivery.id}, read spec.md and the logs in its folder, check the worktree and the PR, and continue until action=finish.`;
    const quoted = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;
    const command = ["orca automations create", "--name", quoted(`Delivery ${delivery.id}`), "--trigger", quoted(config.watchCron), "--provider pi", "--workspace", quoted(`path:${delivery.project}`),
      "--precheck", quoted(`node "${join(root(), "watch.mjs").replace(/\\/g, "/")}" ${delivery.id}`), "--prompt", quoted(prompt), "--json"].join(" ");
    const result = await run(command, delivery.project, { shell: sh(), minutes: 2 });
    const id = /"automation":\s*\{[^{}]*?"id":\s*"([\w-]+)"/.exec(result.text)?.[1];
    change(delivery.id, (entry) => {
      entry.automation = result.code === 0 ? id : undefined;
      entry.watchNote = result.code === 0 && id ? `automation ${id}` : `off (${result.text.trim().split("\n").at(-1)?.slice(0, 160) ?? "orca unavailable"})`;
    });
  };

  const stopWatch = async (delivery: Delivery) => {
    if (!delivery.automation) return;
    const result = await run(`orca automations remove ${delivery.automation} --json`, delivery.project, { shell: sh(), minutes: 2 });
    change(delivery.id, (entry) => {
      entry.watchNote = result.code === 0 ? "removed" : `automation ${delivery.automation} could not be removed`;
      if (result.code === 0) entry.automation = undefined;
    });
  };

  const prove = async (delivery: Delivery, params: any, signal?: AbortSignal): Promise<string> => {
    const gate = String(params.gate ?? "");
    if (!requiredGates(delivery, await onGithub(delivery.project), config).includes(gate)) throw new Error(`gate ${gate} is not part of this delivery`);
    if (gate === "review") throw new Error("the review gate only accepts a verdict from another PI session");
    const dir = folder(delivery.id);
    const check = config.checks.find((entry) => entry.name === gate);
    let ok = false;
    let detail = "";
    if (gate === "spec") {
      const text = existsSync(join(dir, "spec.md")) ? readFileSync(join(dir, "spec.md"), "utf8") : "";
      ok = text.length > 400 && /out of scope|fora do escopo/i.test(text) && /acceptance criteria|crit[eé]rios? de aceite/i.test(text);
      detail = ok ? "" : "spec.md needs goal, scope, out of scope and acceptance criteria";
    } else if (gate === "docs") {
      const changed = (await git(`(git diff --name-only ${delivery.base}; git ls-files -o --exclude-standard) | grep -iE '\\.mdx?$'`, delivery.project)).text.trim();
      ok = changed.length > 0;
      detail = ok ? changed.split("\n").slice(0, 4).join(", ") : "no documentation changed since the start";
    } else if (gate === "ci") {
      ({ ok, detail } = await proveCi(delivery, String(params.pr ?? "").trim()));
    } else {
      const command = check?.command ?? String(params.command ?? "");
      if (isFakeCommand(command)) throw new Error("command must be the project's real verification and must not hide a failure");
      const result = await run(command, delivery.project, { shell: sh(), env: { CI: "1" }, minutes: 25, signal });
      writeFileSync(join(dir, `${gate}.log`), `$ ${command}\n\n${result.text}`);
      ok = result.code === 0;
      detail = ok ? command : `exit ${result.code}: ${result.text.trim().slice(-600)}`;
      if (ok && gate === "tests" && !showsTests(result.text)) {
        ok = false;
        detail = "the command passed but showed no executed test";
      }
      if (ok && gate === "browser") ({ ok, detail } = await proveScreenshots(delivery, command));
    }
    const code = await fingerprint(delivery.project, sh());
    const updated = change(delivery.id, (entry) => { entry.proofs[gate] = { ok, at: new Date().toISOString(), code, detail }; });
    return `${ok ? "PASSED" : "FAILED"} ${gate}: ${detail}\n\n${summary(updated, await pending(updated))}`;
  };

  const proveScreenshots = async (delivery: Delivery, command: string) => {
    const dir = join(folder(delivery.id), "prints");
    const shots = existsSync(dir) ? readdirSync(dir).filter((name) => [".png", ".jpg", ".webp"].includes(extname(name).toLowerCase()) && statSync(join(dir, name)).size > 2_000) : [];
    const absent = PRINTS.filter(([, pattern]) => !shots.some((name) => pattern.test(name))).map(([name]) => name);
    const changed = (await git(`(git diff --name-only ${delivery.base}; git ls-files -o --exclude-standard) | sort -u | grep -viE '\\.mdx?$'`, delivery.project)).text.split("\n").map((name) => name.trim()).filter(Boolean);
    const newest = Math.max(0, ...changed.map((name) => { try { return statSync(join(delivery.project, name)).mtimeMs; } catch { return 0; } }));
    const old = shots.filter((name) => statSync(join(dir, name)).mtimeMs < newest - 2_000);
    if (absent.length) return { ok: false, detail: `missing screenshots: ${absent.join(", ")}` };
    if (old.length) return { ok: false, detail: `screenshots older than the last change: ${old.slice(0, 5).join(", ")}` };
    return { ok: true, detail: `${shots.length} screenshots, ${command}` };
  };

  const proveCi = async (delivery: Delivery, pr: string) => {
    if (!/^(\d+|https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+)$/.test(pr)) throw new Error("pr must be a number or a GitHub pull request link");
    const workflows = join(delivery.project, ".github", "workflows");
    if ((await git("git status --porcelain", delivery.project)).text.trim()) return { ok: false, detail: "there are uncommitted changes" };
    if (!existsSync(workflows) || !readdirSync(workflows).some((name) => /\.ya?ml$/.test(name))) return { ok: false, detail: "the repository has no CI workflow; add one that runs build, lint and tests" };
    const view = await git(`gh pr view "${pr}" --json headRefOid,mergeable,statusCheckRollup`, delivery.project);
    if (view.code) return { ok: false, detail: view.text.trim().slice(-300) };
    const data = JSON.parse(view.text);
    const checks: any[] = data.statusCheckRollup ?? [];
    const red = checks.filter((entry) => !["SUCCESS", "NEUTRAL", "SKIPPED"].includes(String(entry.conclusion || entry.state || "PENDING").toUpperCase()));
    if (data.headRefOid !== (await git("git rev-parse HEAD", delivery.project)).text.trim()) return { ok: false, detail: "the PR head is not the local commit" };
    if (data.mergeable === "CONFLICTING") return { ok: false, detail: "the PR has conflicts" };
    if (!checks.length) return { ok: false, detail: "the PR has no checks yet" };
    if (red.length) return { ok: false, detail: `checks not green: ${red.map((entry) => `${entry.name || entry.context}=${entry.conclusion || entry.status || entry.state}`).join(", ")}` };
    return { ok: true, detail: `PR ${pr}, ${checks.length} green checks` };
  };

  const start = async (params: any, ctx: any): Promise<string> => {
    const open = mine(ctx);
    if (open) throw new Error(`this session already owns delivery ${open.id}`);
    const project = resolve(String(params.project ?? ctx.cwd));
    const head = await git("git rev-parse HEAD", project);
    if (head.code) throw new Error("project must be a git repository with at least one commit");
    const branch = (await git("git rev-parse --abbrev-ref HEAD", project)).text.trim();
    if (/^(main|master|production)$/.test(branch)) throw new Error(`create a branch or worktree before starting on ${branch}`);
    const id = `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 6)}`;
    const delivery: Delivery = { id, title: String(params.title ?? "untitled").slice(0, 120), session: session(ctx), project, base: head.text.trim(), ui: params.ui === true, status: "active", touchedAt: Date.now(), turns: 0, stalls: 0, proofs: {} };
    mkdirSync(join(folder(id), "prints"), { recursive: true });
    save(delivery);
    await startWatch(delivery);
    const current = load(id)!;
    return summary(current, await pending(current));
  };

  const verdict = async (params: any, ctx: any): Promise<string> => {
    const delivery = load(String(params.id ?? ""));
    if (!delivery) throw new Error("unknown delivery");
    if (delivery.session === session(ctx)) throw new Error("the owner cannot review its own delivery");
    const value = String(params.verdict ?? "").trim().toLowerCase();
    if (value !== "approved" && value !== "rejected") throw new Error("verdict must be approved or rejected");
    const report = String(params.report ?? "");
    if (report.length < 200) throw new Error("report must say what was run, what was seen and every finding");
    const code = await fingerprint(delivery.project, sh());
    writeFileSync(join(folder(delivery.id), "review.md"), `# ${value}\n\n${report}\n`);
    change(delivery.id, (entry) => {
      entry.proofs.review = { ok: value === "approved", at: new Date().toISOString(), code, detail: value === "approved" ? "approved by another session" : `rejected: ${report.slice(0, 300)}` };
      if (entry.status === "waiting") entry.waitUntil = Date.now();
    });
    return `Verdict recorded for ${delivery.id}. Tell the owner the findings.`;
  };

  const act = async (params: any, signal: AbortSignal | undefined, ctx: any): Promise<string> => {
    if (params.action === "start") return start(params, ctx);
    if (params.action === "verdict") return verdict(params, ctx);
    if (params.action === "resume") {
      const delivery = load(String(params.id ?? ""));
      if (!delivery || ["done", "cancelled"].includes(delivery.status)) throw new Error("no open delivery with this id");
      const current = change(delivery.id, (entry) => { entry.session = session(ctx); entry.status = "active"; entry.stalls = 0; });
      return summary(current, await pending(current));
    }
    const delivery = mine(ctx, [...OPEN, "ready"]);
    if (!delivery) throw new Error("no open delivery in this session; use action=start or action=resume id=...");
    if (params.action === "status") return summary(delivery, await pending(delivery));
    if (params.action === "prove") return prove(delivery, params, signal);
    if (params.action === "wait") {
      const own = (await pending(delivery)).filter((gate) => !EXTERNAL.includes(gate));
      if (own.length && !/^external:/i.test(String(params.reason ?? ""))) throw new Error(`these gates depend only on you: ${own.join(", ")}. If someone else is doing them, reason=external:<who and what>`);
      const minutes = Math.min(Math.max(Number(params.minutes ?? 15), 2), 120);
      change(delivery.id, (entry) => { entry.status = "waiting"; entry.waitUntil = Date.now() + minutes * 60_000; entry.reason = String(params.reason ?? "").slice(0, 200); });
      return `Waiting up to ${minutes} min. End the turn now; the answer or the Orca watch wakes the delivery.`;
    }
    if (params.action === "ask") {
      if (delivery.status === "ready") return "The delivery is ready. Ask the owner for the single go-ahead to merge and publish, then end the turn.";
      if (String(params.reason ?? "").length < 15) throw new Error("say which decision only the owner can make");
      change(delivery.id, (entry) => { entry.status = "asking"; entry.reason = String(params.reason).slice(0, 300); });
      return "Ask the owner in one sentence and end the turn. The answer reactivates the delivery.";
    }
    if (params.action === "finish") {
      if (delivery.status === "ready") {
        await stopWatch(change(delivery.id, (entry) => { entry.status = "done"; }));
        return "Delivery closed. Close the worktree and processes you opened.";
      }
      const missing = await pending(delivery);
      if (missing.length) throw new Error(`still missing:\n${summary(delivery, missing)}`);
      await stopWatch(change(delivery.id, (entry) => { entry.status = "ready"; }));
      return `Delivery ${delivery.id} is READY. Report the proof of each gate, the PR and what was left out, and ask for the single go-ahead to merge and publish.`;
    }
    if (params.action === "cancel") {
      if (!isCancelRequest(lastUserText(ctx))) throw new Error("cancel only when the owner asks for it");
      await stopWatch(change(delivery.id, (entry) => { entry.status = "cancelled"; }));
      return "Delivery cancelled at the owner's request.";
    }
    throw new Error("unknown action");
  };

  let queue: Promise<unknown> = Promise.resolve();
  const serialized = <T>(work: () => Promise<T>): Promise<T> => {
    const result = queue.then(work, work);
    queue = result.catch(() => undefined);
    return result;
  };

  pi.registerTool({
    name: "delivery",
    label: "Delivery",
    description: "Runs a delivery to the end. Actions: start (title, project, ui), status, prove (gate, command or pr), wait (minutes, reason), ask (reason), resume (id), verdict (id, verdict, report; only another session), finish, cancel (only when the owner asks).",
    promptSnippet: "Open, prove and finish a complete delivery",
    promptGuidelines: ["Use delivery with action=start when the owner asks for a change to be delivered to the end, and keep going until action=finish."],
    parameters: Type.Object({
      action: Type.Union(["start", "status", "prove", "wait", "ask", "resume", "verdict", "finish", "cancel"].map((name) => Type.Literal(name)) as any),
      id: Type.Optional(Type.String()), title: Type.Optional(Type.String()), project: Type.Optional(Type.String()), ui: Type.Optional(Type.Boolean()),
      gate: Type.Optional(Type.String()), command: Type.Optional(Type.String()), pr: Type.Optional(Type.String()),
      minutes: Type.Optional(Type.Number()), reason: Type.Optional(Type.String()), verdict: Type.Optional(Type.String()), report: Type.Optional(Type.String()),
    }),
    execute: (_id: string, params: any, signal: AbortSignal | undefined, _update: any, ctx: any) => serialized(async () => reply(await act(params, signal, ctx))),
  } as any);

  pi.on("before_agent_start", (_event: any, ctx: any) => {
    const delivery = mine(ctx, ["waiting", "asking", "stalled"]);
    if (delivery) change(delivery.id, (entry) => { entry.status = "active"; entry.stalls = 0; });
  });

  pi.on("agent_before_settle", async (event: any, ctx: any) => {
    if (["error", "aborted"].includes(event.outcome)) return;
    const delivery = mine(ctx, ["active"]);
    if (!delivery) return;
    const missing = await pending(delivery);
    const signature = createHash("sha256").update(missing.join() + JSON.stringify(delivery.proofs) + await fingerprint(delivery.project, sh())).digest("hex");
    const current = change(delivery.id, (entry) => advanceTurn(entry, signature, config));
    const lead = current.status === "stalled"
      ? `Delivery ${current.id} STALLED (${current.reason}). Tell the owner in a few lines what is missing, what you tried and what you need. Then stop.`
      : "The delivery is not finished. Continue without asking whether to continue. Use action=wait when it depends on the reviewer or CI, action=ask when it depends on an owner decision.";
    return { entries: [...(event.entries ?? []), { type: "custom_message", customType: "delivery-gate", display: true, content: `${lead}\n\n${summary(current, missing)}` }], continue: true };
  });
}
