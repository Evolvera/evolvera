/**
 * Project Memory Extension
 * 
 * Automatically injects project memory summary into the system prompt
 * at the start of each session. If no memory exists, prompts the model
 * to perform an initial scan.
 * 
 * Memory location: {cwd}/.pi/memory/_summary.md
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const MEMORY_DIR = ".pi/memory";
const SUMMARY_FILE = "_summary.md";

function findMemorySummary(cwd: string): string | null {
  const summaryPath = resolve(cwd, MEMORY_DIR, SUMMARY_FILE);
  
  if (existsSync(summaryPath)) {
    try {
      const content = readFileSync(summaryPath, "utf-8");
      // Truncate if too long (keep ~8k chars for summary injection)
      if (content.length > 8000) {
        return content.slice(0, 8000) + "\n\n[... summary truncated ...]";
      }
      return content;
    } catch (error) {
      console.error("[project-memory] Failed to read summary:", error);
      return null;
    }
  }
  
  return null;
}

export default function projectMemoryExtension(pi: ExtensionAPI) {
  // Hook into before_agent_start to inject project memory
  pi.on("before_agent_start", async (event, ctx) => {
    const cwd = ctx.cwd || process.cwd();
    
    console.log("[project-memory] Checking for project memory in:", cwd);
    
    const summary = findMemorySummary(cwd);
    
    if (summary) {
      // Inject existing summary into system prompt
      const memoryBlock = `
=== PROJECT MEMORY (auto-loaded from ${MEMORY_DIR}/) ===
${summary}
=== END PROJECT MEMORY ===
`;
      
      // Prepend to system prompt if exists
      if (ctx.systemPrompt) {
        ctx.systemPrompt = memoryBlock + "\n\n" + ctx.systemPrompt;
      } else {
        ctx.systemPrompt = memoryBlock;
      }
      
      console.log("[project-memory] Injected project memory summary");
    } else {
      // No memory found - inject prompt to create it
      const noMemoryBlock = `
=== PROJECT MEMORY ===
No memory found for this project. This is a NEW PROJECT that needs memory setup.

EXECUTE THE INITIAL SCAN following the project-memory skill:
1. Create the directory: ${MEMORY_DIR}/
2. Copy templates from: ~/.pi/agent/skills/project-memory/templates/
3. Read project files: package.json (or pyproject.toml/Cargo.toml/go.mod), README.md, tsconfig.json, .env.example, structure
4. Populate each .md file with discovered information
5. Generate _summary.md synthesizing all fields
6. Show user the scan summary

See skill: ~/.pi/agent/skills/project-memory/
=== END PROJECT MEMORY ===
`;
      
      if (ctx.systemPrompt) {
        ctx.systemPrompt = noMemoryBlock + "\n\n" + ctx.systemPrompt;
      } else {
        ctx.systemPrompt = noMemoryBlock;
      }
      
      console.log("[project-memory] No memory found - prompt injected for initial scan");
    }
  });
  
  console.log("[project-memory] Extension loaded: project memory auto-injection enabled");
}
