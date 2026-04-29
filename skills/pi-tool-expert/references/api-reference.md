# PI Extension API Reference

## ExtensionAPI Methods

### pi.on(event, handler)
Subscribe to lifecycle events.

### pi.registerTool(definition)
Register a custom tool. Definition includes:
- `name`: string (unique)
- `label`: string (display name)
- `description`: string
- `parameters`: TypeBox schema
- `execute`: async function
- `promptSnippet`: string (optional, for tool list)
- `promptGuidelines`: string[] (optional)

### pi.registerCommand(name, options)
Register a slash command.

### pi.registerShortcut(shortcut, options)
Register keyboard shortcut.

### pi.registerFlag(name, options)
Register CLI flag.

### pi.sendMessage(message, options)
Inject custom message into session.

### pi.sendUserMessage(content, options)
Send user message to agent.

### pi.appendEntry(customType, data?)
Persist extension state.

### pi.setSessionName(name)
Set session display name.

### pi.getAllTools() / pi.getActiveTools() / pi.setActiveTools(names)
Manage tools.

### pi.exec(command, args, options?)
Execute shell command.

## ExtensionContext

### ctx.ui
- `notify(message, type)` - Show notification
- `confirm(title, message)` - Yes/no dialog
- `input(title, placeholder?)` - Text input
- `select(title, items)` - Selection dialog
- `setStatus(id, text)` - Footer status
- `setWidget(id, lines)` - Widget display

### ctx.sessionManager
- `getEntries()` - All entries
- `getBranch()` - Current branch
- `getLeafId()` - Current leaf ID
- `getSessionFile()` - Session file path

### ctx.modelRegistry / ctx.model
Access to models and API keys.

### ctx.signal
AbortSignal for current operation.

### ctx.cwd
Current working directory.

### ctx.hasUI
Boolean indicating if UI is available.

## Event Types

### Session Events
- `session_start` - Session started
- `session_shutdown` - Session ending
- `session_before_switch` - Before switching sessions
- `session_before_fork` - Before fork/clone

### Agent Events
- `before_agent_start` - Before agent loop
- `agent_start` / `agent_end` - Agent loop start/end
- `turn_start` / `turn_end` - Turn start/end
- `message_start` / `message_update` / `message_end`

### Tool Events
- `tool_call` - Tool being called (can block)
- `tool_result` - Tool result received (can modify)
- `tool_execution_start` / `tool_execution_update` / `tool_execution_end`

### Context Events
- `context` - Before LLM call (can modify messages)
- `before_provider_request` - Before HTTP request
- `after_provider_response` - After HTTP response

### Resource Events
- `resources_discover` - Discover resources (skills, prompts, themes)

## Tool Result Format

```typescript
{
  content: [
    { type: "text", text: "result" },
    { type: "image", source: { type: "base64", mediaType: "image/png", data: "..." } }
  ],
  details: {},
  isError: false
}
```

## TypeBox Patterns

```typescript
import { Type } from "typebox";

// String
Type.String({ description: "..." })

// Number
Type.Number({ description: "..." })

// Boolean
Type.Boolean({ description: "..." })

// Enum
Type.Union([
  Type.Literal("option1"),
  Type.Literal("option2"),
])

// Array
Type.Array(Type.String(), { description: "..." })

// Object
Type.Object({
  name: Type.String({ description: "..." }),
  age: Type.Optional(Type.Number({ description: "..." })),
})

// With defaults
Type.String({ description: "...", default: "default_value" })
```
