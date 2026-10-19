/**
 * PI Tool Expert Helper
 * 
 * Extensão helper para introspecção e validação do ambiente PI.
 * Fornece tools para verificar configurações, listar extensões/skills,
 * e validar estrutura de código.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type ManagedContext = { profile: { id: string; agentDir: string }; admitUserResources(input: { resource: string; root: string }): void } | undefined;

/**
 * Plastic Memory is not installed while disabled (installers delete extensions/plastic-memory),
 * so load its user-context guard lazily. Without the module, only an active managed user
 * context (PI_USER_ID or the users receipt) must fail closed; ordinary sessions continue.
 */
async function loadManagedMemoryContext(cwd: string | undefined): Promise<ManagedContext> {
  let mod: { managedMemoryContext(cwd?: string): ManagedContext };
  try {
    mod = await import("./plastic-memory/index.ts");
  } catch {
    if (process.env.PI_USER_ID !== undefined || Object.getOwnPropertyDescriptor(globalThis, Symbol.for("pi.users.context"))) {
      throw new Error("managed user context cannot be verified without plastic-memory");
    }
    return undefined;
  }
  return mod.managedMemoryContext(cwd);
}

/** Report package/extension sources as strings only, without object fields or URL userinfo. */
function publicSources(entries: unknown): string[] {
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry) => {
    const source = typeof entry === "string" ? entry
      : entry && typeof entry === "object" && typeof (entry as { source?: unknown }).source === "string" ? (entry as { source: string }).source
      : undefined;
    return source === undefined ? [] : [source.replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/gi, "$1")];
  });
}

export default function (pi: ExtensionAPI) {
  // Tool: Listar ambiente PI
  pi.registerTool({
    name: "pi_env_inspect",
    label: "PI Env Inspect",
    description: "Introspect the PI environment: extensions, skills, settings, MCP servers",
    parameters: Type.Object({
      detail: Type.Optional(Type.Union([
        Type.Literal("summary"),
        Type.Literal("full"),
      ], { description: "Level of detail", default: "summary" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      let managed;
      try {
        managed = await loadManagedMemoryContext(typeof ctx?.cwd === "string" ? ctx.cwd : undefined);
        if (managed) managed.admitUserResources({ resource: "pi-env-inspect", root: managed.profile.agentDir });
      } catch {
        return {
          content: [{ type: "text" as const, text: "PI environment is unavailable for this user context." }],
          details: { status: "unavailable" },
          isError: true,
        };
      }
      const home = process.env.HOME || "/Users/j.henrique";
      const piDir = managed ? managed.profile.agentDir : path.join(home, ".pi", "agent");
      
      const result: Record<string, unknown> = {};
      if (managed) result.profile = { id: managed.profile.id, agentDir: managed.profile.agentDir };
      
      // Extensions
      const extDir = path.join(piDir, "extensions");
      if (fs.existsSync(extDir)) {
        result.extensions = fs.readdirSync(extDir).filter(f => f.endsWith(".ts") || !f.includes("."));
      }
      
      // Skills
      const skillsDir = path.join(piDir, "skills");
      if (fs.existsSync(skillsDir)) {
        result.skills = fs.readdirSync(skillsDir).filter(f => {
          const stat = fs.statSync(path.join(skillsDir, f));
          return stat.isDirectory();
        });
      }
      
      // Settings
      const settingsPath = path.join(piDir, "settings.json");
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        result.settings = {
          packages: publicSources(settings.packages),
          extensions: publicSources(settings.extensions),
          defaultProvider: settings.defaultProvider,
          defaultModel: settings.defaultModel,
        };
      }
      
      // MCP
      const mcpPath = path.join(piDir, "mcp.json");
      if (fs.existsSync(mcpPath)) {
        const mcp = JSON.parse(fs.readFileSync(mcpPath, "utf-8"));
        result.mcpServers = Object.keys(mcp.mcpServers || {});
      }
      
      // Built-in tools
      result.builtInTools = pi.getAllTools()
        .filter(t => t.sourceInfo?.source === "builtin")
        .map(t => t.name);
      
      // All tools
      result.allTools = pi.getAllTools().map(t => ({
        name: t.name,
        source: t.sourceInfo?.source,
        description: t.description?.slice(0, 100),
      }));
      
      return {
        content: [{
          type: "text" as const,
          text: `PI Environment:\n${JSON.stringify(result, null, 2)}`,
        }],
        details: result,
      };
    },
  });

  // Tool: Validar skill
  pi.registerTool({
    name: "pi_validate_skill",
    label: "PI Validate Skill",
    description: "Validate a skill directory structure and SKILL.md",
    parameters: Type.Object({
      skillPath: Type.String({ description: "Path to skill directory" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const errors: string[] = [];
      const warnings: string[] = [];
      
      // Check directory exists
      if (!fs.existsSync(params.skillPath)) {
        return {
          content: [{ type: "text" as const, text: `ERROR: Directory not found: ${params.skillPath}` }],
          details: { errors: [`Directory not found: ${params.skillPath}`] },
          isError: true,
        };
      }
      
      const dirName = path.basename(params.skillPath);
      const skillMdPath = path.join(params.skillPath, "SKILL.md");
      
      // Check SKILL.md exists
      if (!fs.existsSync(skillMdPath)) {
        errors.push("SKILL.md not found in directory");
      } else {
        const content = fs.readFileSync(skillMdPath, "utf-8");
        
        // Check frontmatter
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (!frontmatterMatch) {
          errors.push("Missing YAML frontmatter (---\nname:...\ndescription:...\n---)");
        } else {
          const frontmatter = frontmatterMatch[1];
          
          // Check name
          const nameMatch = frontmatter.match(/name:\s*(.+)/);
          if (!nameMatch) {
            errors.push("Missing 'name' in frontmatter");
          } else {
            const name = nameMatch[1].trim();
            if (name !== dirName) {
              errors.push(`Name mismatch: frontmatter says "${name}" but directory is "${dirName}"`);
            }
            if (!/^[a-z0-9-]+$/.test(name)) {
              errors.push(`Invalid name "${name}": must be lowercase letters, numbers, hyphens only`);
            }
            if (name.length > 64) {
              errors.push(`Name "${name}" exceeds 64 characters`);
            }
          }
          
          // Check description
          const descMatch = frontmatter.match(/description:\s*(.+)/);
          if (!descMatch) {
            errors.push("Missing 'description' in frontmatter");
          } else {
            const desc = descMatch[1].trim();
            if (desc.length > 1024) {
              errors.push(`Description exceeds 1024 characters (${desc.length})`);
            }
            if (desc.length < 20) {
              warnings.push("Description is very short; be more specific about when to use this skill");
            }
          }
        }
      }
      
      const status = errors.length === 0 ? "VALID" : "INVALID";
      
      return {
        content: [{
          type: "text" as const,
          text: `Skill Validation: ${status}\n\n${errors.length > 0 ? `Errors:\n${errors.map(e => `- ❌ ${e}`).join("\n")}` : "✅ No errors"}\n\n${warnings.length > 0 ? `Warnings:\n${warnings.map(w => `- ⚠️ ${w}`).join("\n")}` : ""}`,
        }],
        details: { status, errors, warnings },
      };
    },
  });

  // Tool: Validar extensão
  pi.registerTool({
    name: "pi_validate_extension",
    label: "PI Validate Extension",
    description: "Validate an extension TypeScript file for common errors",
    parameters: Type.Object({
      extPath: Type.String({ description: "Path to extension .ts file" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const errors: string[] = [];
      const warnings: string[] = [];
      
      if (!fs.existsSync(params.extPath)) {
        return {
          content: [{ type: "text" as const, text: `ERROR: File not found: ${params.extPath}` }],
          details: { errors: [`File not found: ${params.extPath}`] },
          isError: true,
        };
      }
      
      const content = fs.readFileSync(params.extPath, "utf-8");
      
      // Check export default
      if (!content.includes("export default function")) {
        errors.push("Missing 'export default function' - extensions must export a default function");
      }
      
      // Check ExtensionAPI type
      if (!content.includes("ExtensionAPI")) {
        errors.push("Missing 'ExtensionAPI' type reference");
      }
      
      // Check for import type vs import
      if (content.includes("import { ExtensionAPI }") && !content.includes("import type { ExtensionAPI }")) {
        warnings.push("Consider using 'import type { ExtensionAPI }' for type-only imports");
      }
      
      // Check for common mistakes
      if (content.includes("pi.registerTool") && !content.includes("Type.Object")) {
        warnings.push("Tool registered but no TypeBox schema found - parameters need Type.Object()");
      }
      
      if (content.includes("pi.on(\"tool_call\"") && !content.includes("isToolCallEventType")) {
        warnings.push("tool_call handler without isToolCallEventType - may lack type safety");
      }
      
      const status = errors.length === 0 ? "VALID" : "INVALID";
      
      return {
        content: [{
          type: "text" as const,
          text: `Extension Validation: ${status}\n\n${errors.length > 0 ? `Errors:\n${errors.map(e => `- ❌ ${e}`).join("\n")}` : "✅ No errors"}\n\n${warnings.length > 0 ? `Warnings:\n${warnings.map(w => `- ⚠️ ${w}`).join("\n")}` : ""}`,
        }],
        details: { status, errors, warnings },
      };
    },
  });

  // Tool: Verificar conflitos de nomes
  pi.registerTool({
    name: "pi_check_name_conflicts",
    label: "PI Check Name Conflicts",
    description: "Check if a proposed tool/command name conflicts with existing ones",
    parameters: Type.Object({
      name: Type.String({ description: "Proposed name to check" }),
      type: Type.Union([
        Type.Literal("tool"),
        Type.Literal("command"),
      ], { description: "Type of name to check" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const existing = pi.getAllTools().map(t => t.name);
      const commands = pi.getCommands().map(c => c.name);
      
      const conflicts: string[] = [];
      
      if (params.type === "tool") {
        if (existing.includes(params.name)) {
          conflicts.push(`Tool "${params.name}" already exists`);
        }
        // Check built-ins
        const builtins = ["read", "write", "edit", "bash", "webfetch", "websearch", "mcp"];
        if (builtins.includes(params.name)) {
          conflicts.push(`"${params.name}" is a built-in tool`);
        }
      } else {
        if (commands.includes(params.name)) {
          conflicts.push(`Command "/${params.name}" already exists`);
        }
      }
      
      return {
        content: [{
          type: "text" as const,
          text: conflicts.length === 0
            ? `✅ "${params.name}" is available for ${params.type}`
            : `❌ Conflicts found:\n${conflicts.map(c => `- ${c}`).join("\n")}`,
        }],
        details: { conflicts, available: conflicts.length === 0 },
      };
    },
  });

  // Notify on session start (ctx only available inside event handlers)
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("PI Tool Expert Helper loaded", "info");
  });
}
