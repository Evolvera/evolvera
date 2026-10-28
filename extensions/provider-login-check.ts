import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";

/**
 * Checks, once per primary session, that every provider the agents are routed to can still authenticate.
 *
 * Observed failure: the Anthropic OAuth token expired and its refresh returned 400. Every builder-design and
 * website-designer launch then died before doing any work, and the orchestrator retried each one for 2 to 11
 * minutes before falling back. Resolving auth up front turns that into one warning and one line in the
 * system prompt naming the providers to avoid until the user runs /login.
 */

const PRIMARY_PROMPT = "# PI Coding Agent";
const CHECK_TIMEOUT_MS = 15_000;

/** provider → one routed model id, from the `model:` frontmatter of the installed agents. */
export function routedProviders(agentsDir: string): Map<string, { model: string; agents: string[] }> {
  const routes = new Map<string, { model: string; agents: string[] }>();
  let files: string[] = [];
  try { files = readdirSync(agentsDir).filter((name) => name.endsWith(".md")); } catch { return routes; }
  for (const file of files) {
    let text = "";
    try { text = readFileSync(join(agentsDir, file), "utf8"); } catch { continue; }
    const match = /^model:\s*([\w.-]+)\/([\w.:-]+)\s*$/m.exec(text);
    if (!match) continue;
    const [, provider, model] = match;
    const entry = routes.get(provider) ?? { model, agents: [] };
    entry.agents.push(file.replace(/\.md$/, ""));
    routes.set(provider, entry);
  }
  return routes;
}

export function unavailableNote(down: Map<string, string[]>): string {
  const lines = [...down].map(([provider, agents]) => `- ${provider}: ${agents.join(", ")}`);
  return `\n\n## Unavailable providers this session\n\nLogin failed at startup for the providers below. Do not launch these agents; route their work to the nearest working tier (\`builder\` for \`builder-design\`) and tell the user once to run \`/login\`.\n${lines.join("\n")}\n`;
}

type Registry = ExtensionContext["modelRegistry"];

async function canAuthenticate(registry: Registry, provider: string, modelId: string): Promise<boolean | undefined> {
  const model = registry.find(provider, modelId);
  if (!model) return undefined; // not a configured model: nothing to say about its login
  try {
    const auth = await Promise.race([
      registry.getApiKeyAndHeaders(model),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), CHECK_TIMEOUT_MS)),
    ]);
    return Boolean(auth?.ok);
  } catch {
    return false;
  }
}

export default function providerLoginCheck(pi: ExtensionAPI, agentsDir = join(getAgentDir(), "agents")): void {
  let checked: Promise<Map<string, string[]>> | undefined;

  pi.on("before_agent_start", async (event, ctx) => {
    const custom = event.systemPromptOptions?.customPrompt;
    if (!(typeof custom === "string" && custom.trimStart().startsWith(PRIMARY_PROMPT))) return;
    checked ??= (async () => {
      const down = new Map<string, string[]>();
      const routes = [...routedProviders(agentsDir)];
      const results = await Promise.all(routes.map(([provider, { model }]) => canAuthenticate(ctx.modelRegistry, provider, model)));
      routes.forEach(([provider, { agents }], i) => { if (results[i] === false) down.set(provider, agents); });
      if (down.size && ctx.hasUI) {
        ctx.ui.notify(`Login vencido em ${[...down.keys()].join(", ")}: rode /login. Até lá, ${[...down.values()].flat().join(", ")} usam o modelo de reserva.`, "warning");
      }
      return down;
    })();
    const down = await checked;
    if (down.size) return { systemPrompt: event.systemPrompt + unavailableNote(down) };
  });
}
