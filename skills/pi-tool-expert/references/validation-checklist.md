# Validation Checklist

## Pre-Implementation

- [ ] Verify the environment: `ls ~/.pi/agent/extensions/`, `ls ~/.pi/agent/skills/`, `cat ~/.pi/agent/settings.json`
- [ ] Identify the correct approach (extension vs. skill vs. MCP vs. AGENTS.md)
- [ ] Check for name conflicts
- [ ] Define a clear goal

## Extension Validation

### Structure
- [ ] `.ts` or `index.ts` file in a directory
- [ ] The default exported function receives `ExtensionAPI`
- [ ] Use `import type` for types
- [ ] No TypeScript errors

### Tools
- [ ] `name` is unique (check with `pi.getAllTools()`)
- [ ] `name` does not conflict with built-ins (read, write, edit, bash, webfetch, websearch, mcp_*, etc.)
- [ ] `label` is descriptive
- [ ] `description` is clear and complete
- [ ] `parameters` uses TypeBox with descriptions for every field
- [ ] `execute` returns `{ content: [...], details: {} }`
- [ ] `execute` handles errors (try/catch or validation)
- [ ] Use `onUpdate` for streaming when appropriate
- [ ] Respect `signal` for aborts

### Events
- [ ] Handler has the correct signature `(event, ctx) =>`
- [ ] Return value matches the event (`{ block: true }`, `{ cancel: true }`, etc.)
- [ ] Do not modify event.input without validation (tool_call)
- [ ] Do not forget to return when required

### Commands
- [ ] Name is unique
- [ ] Handler is asynchronous
- [ ] Use `ctx.ui` for interaction

## Skill Validation

### Frontmatter
- [ ] YAML at the beginning: `---\nname: ...\ndescription: ...\n---`
- [ ] `name` matches the parent directory
- [ ] `name`: lowercase, hyphens, max 64 chars
- [ ] `description`: max 1024 characters, specific
- [ ] No invalid fields

### Content
- [ ] Valid Markdown
- [ ] References use paths relative to the skill
- [ ] Scripts have execute permission (chmod +x)
- [ ] Commands are testable

## MCP Validation

### Configuration
- [ ] Valid JSON in `~/.pi/agent/mcp.json`
- [ ] Each server has a unique name
- [ ] `command` exists and is executable
- [ ] `args` are correct
- [ ] `lifecycle` is one of: lazy, eager, keep-alive
- [ ] `env` uses `${VAR}` for interpolation

### Testing
- [ ] `/mcp-status` shows the server
- [ ] Tools appear in `/mcp-list`
- [ ] Names are correctly prefixed (`mcp_server_tool`)
- [ ] No conflicts with other tools

## Post-Implementation

- [ ] `/reload` works without errors
- [ ] Skill appears in `/skill:name`
- [ ] Tools appear in the list
- [ ] Basic functionality tested
- [ ] Logs checked for errors
- [ ] Integration with the rest of the system validated
