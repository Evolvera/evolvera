// Runs one synthetic Pi AgentSession against a disposable package copy and the
// in-process faux provider (no network, in-memory session/settings, temp agent dir).
// Usage: node context-wall-scenario.mjs <packageRoot> <wall|loop|normal-length|stop-threshold>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [packageRoot, mode] = process.argv.slice(2);
const sdk = await import(pathToFileURL(path.join(packageRoot, 'dist/index.js')).href);
const faux = await import(pathToFileURL(path.join(packageRoot, 'node_modules/@earendil-works/pi-ai/dist/providers/faux.js')).href);
const { createAgentSession, createExtensionRuntime, ModelRuntime, SessionManager, SettingsManager } = sdk;

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'context-wall-agent-'));
try {
  const core = faux.createFauxCore({ models: [{ id: 'wall', contextWindow: 2000, maxTokens: 500 }] });
  const runtime = await ModelRuntime.create({ authPath: path.join(home, 'auth.json'), modelsPath: null });
  runtime.registerProvider(core.provider, {
    api: core.api,
    streamSimple: core.streamSimple,
    apiKey: 'synthetic',
    baseUrl: 'http://127.0.0.1:9',
    models: core.models.map((model) => ({ ...model })),
  });
  const resourceLoader = {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => 'synthetic',
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
  const { session } = await createAgentSession({
    cwd: home,
    agentDir: home,
    model: core.models[0],
    thinkingLevel: 'off',
    modelRuntime: runtime,
    resourceLoader,
    tools: [],
    sessionManager: SessionManager.inMemory(home),
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: true, reserveTokens: 300, keepRecentTokens: 50 },
      retry: { enabled: false },
    }),
  });
  const events = [];
  session.subscribe((event) => {
    if (event.type === 'compaction_end') {
      events.push({ reason: event.reason, willRetry: event.willRetry, failed: Boolean(event.errorMessage) });
    }
  });

  // Warm-up turn gives compaction older history to summarize.
  core.setResponses([faux.fauxAssistantMessage('warmup-ok')]);
  await session.prompt('hello '.repeat(40));

  const summary = faux.fauxAssistantMessage('## Goal\nsynthetic summary');
  const truncated = faux.fauxAssistantMessage('x', { stopReason: 'length' });
  const big = 'p'.repeat(4 * 1700);
  const plan = {
    wall: { prompt: big, responses: [truncated, summary, faux.fauxAssistantMessage('RESUMED-DONE')] },
    // Built lazily and a few ms later: a real provider stamps the reply well after
    // compaction, while a pre-built or same-millisecond faux reply would be ignored
    // as pre-compaction usage (`timestamp <= compaction`).
    loop: { prompt: big, responses: [truncated, summary, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return faux.fauxAssistantMessage('y', { stopReason: 'length' });
    }] },
    'normal-length': { prompt: 'short', responses: [faux.fauxAssistantMessage('z', { stopReason: 'length' })] },
    'stop-threshold': { prompt: big, responses: [faux.fauxAssistantMessage('FULL-ANSWER'), summary] },
  }[mode];
  if (!plan) throw new Error(`unknown mode ${mode}`);
  core.setResponses(plan.responses);
  await session.prompt(plan.prompt);

  const messages = session.agent.state.messages;
  const last = messages[messages.length - 1];
  const lastText = Array.isArray(last?.content)
    ? last.content.filter((part) => part.type === 'text').map((part) => part.text).join('')
    : '';
  console.log(JSON.stringify({
    calls: core.state.callCount,
    pending: core.getPendingResponseCount(),
    events,
    lastRole: last?.role,
    lastStop: last?.stopReason,
    lastText,
  }));
  session.dispose();
} finally {
  fs.rmSync(home, { recursive: true, force: true });
}
