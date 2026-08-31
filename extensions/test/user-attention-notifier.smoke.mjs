import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "../..");
const { registerUserAttentionNotifier } = await import(
  pathToFileURL(path.join(root, "extensions", "user-attention-notifier.ts"))
);

const previous = process.env.PI_ATTENTION_NOTIFICATIONS;
const previousOrcaPaneKey = process.env.ORCA_PANE_KEY;
delete process.env.PI_ATTENTION_NOTIFICATIONS;
delete process.env.ORCA_PANE_KEY;

const handlers = new Map();
const notifications = [];
registerUserAttentionNotifier(
  {
    on(name, handler) {
      handlers.set(name, handler);
    },
    registerCommand(name, command) {
      handlers.set(`command:${name}`, command.handler);
    },
  },
  (title, body) => notifications.push({ title, body }),
  10,
);

const before = handlers.get("before_agent_start");
const start = handlers.get("agent_start");
const end = handlers.get("agent_end");
const shutdown = handlers.get("session_shutdown");
const wait = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));
const ctx = {
  mode: "tui",
  cwd: "/tmp/example-project",
  isIdle: () => true,
  hasPendingMessages: () => false,
};

try {
  // Global extensions load in subagents too; their completion must stay silent.
  await before({ systemPromptOptions: { customPrompt: "# Builder\n" } });
  await start();
  await end({}, ctx);
  await wait();
  assert.equal(notifications.length, 0);

  // A retry/continuation starting inside the grace delay cancels the prior end.
  await before({ systemPromptOptions: { customPrompt: "# PI Coding Agent\n" } });
  await start();
  await end({}, ctx);
  await start();
  await wait();
  assert.equal(notifications.length, 0);

  // Only a stable idle end from the primary orchestrator notifies.
  await end({}, ctx);
  await wait();
  assert.deepEqual(notifications, [
    { title: "example-project", body: "O agente terminou e está te aguardando." },
  ]);

  // Pending follow-ups mean the orchestrator is not waiting for the user.
  const pendingCtx = { ...ctx, hasPendingMessages: () => true };
  await end({}, pendingCtx);
  await wait();
  assert.equal(notifications.length, 1);

  await end({}, ctx);
  await shutdown();
  await wait();
  assert.equal(notifications.length, 1);

  assert.ok(handlers.has("command:attention"));

  // Orca owns completion attention for Orca-managed panes by default.
  process.env.ORCA_PANE_KEY = "test-pane";
  const orcaHandlers = new Map();
  const orcaNotifications = [];
  registerUserAttentionNotifier(
    {
      on(name, handler) {
        orcaHandlers.set(name, handler);
      },
      registerCommand(name, command) {
        orcaHandlers.set(`command:${name}`, command.handler);
      },
    },
    (title, body) => orcaNotifications.push({ title, body }),
    10,
  );
  await orcaHandlers.get("before_agent_start")({ systemPromptOptions: { customPrompt: "# PI Coding Agent\n" } });
  await orcaHandlers.get("agent_start")();
  await orcaHandlers.get("agent_end")({}, ctx);
  await wait();
  assert.equal(orcaNotifications.length, 0);

  // An explicit per-session command can still opt back into the old alert.
  await orcaHandlers.get("command:attention")("on", { hasUI: false });
  await orcaHandlers.get("agent_end")({}, ctx);
  await wait();
  assert.equal(orcaNotifications.length, 1);

  console.log("user-attention-notifier smoke: PASS");
} finally {
  if (previous === undefined) delete process.env.PI_ATTENTION_NOTIFICATIONS;
  else process.env.PI_ATTENTION_NOTIFICATIONS = previous;
  if (previousOrcaPaneKey === undefined) delete process.env.ORCA_PANE_KEY;
  else process.env.ORCA_PANE_KEY = previousOrcaPaneKey;
}
