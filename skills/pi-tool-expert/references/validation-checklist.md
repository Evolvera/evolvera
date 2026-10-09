# Validation Checklist

## Pre-Implementation

- [ ] Verificar ambiente: `ls ~/.pi/agent/extensions/`, `ls ~/.pi/agent/skills/`, `cat ~/.pi/agent/settings.json`
- [ ] Identificar abordagem correta (extensão vs skill vs MCP vs AGENTS.md)
- [ ] Verificar conflitos de nomes
- [ ] Definir objetivo claro

## Extension Validation

### Structure
- [ ] Arquivo `.ts` ou `index.ts` em diretório
- [ ] Export default function recebe `ExtensionAPI`
- [ ] Usa `import type` para tipos
- [ ] Sem erros de TypeScript

### Tools
- [ ] `name` é único (verificar com `pi.getAllTools()`)
- [ ] `name` não conflita com built-ins (read, write, edit, bash, webfetch, websearch, mcp_*, etc.)
- [ ] `label` é descritivo
- [ ] `description` é clara e completa
- [ ] `parameters` usa TypeBox com descriptions em todos os campos
- [ ] `execute` retorna `{ content: [...], details: {} }`
- [ ] `execute` lida com erros (try/catch ou validação)
- [ ] Usa `onUpdate` para streaming quando apropriado
- [ ] Respeita `signal` para abort

### Events
- [ ] Handler tem assinatura correta `(event, ctx) =>`
- [ ] Retorno condiz com evento (`{ block: true }`, `{ cancel: true }`, etc.)
- [ ] Não modifica event.input sem validação (tool_call)
- [ ] Não esquece de retornar quando necessário

### Commands
- [ ] Nome é único
- [ ] Handler assíncrono
- [ ] Usa `ctx.ui` para interação

## Skill Validation

### Frontmatter
- [ ] YAML no início: `---\nname: ...\ndescription: ...\n---`
- [ ] `name` corresponde ao diretório pai
- [ ] `name`: lowercase, hyphens, max 64 chars
- [ ] `description`: max 1024 chars, específica
- [ ] Sem campos inválidos

### Content
- [ ] Markdown válido
- [ ] Referências usam caminhos relativos ao skill
- [ ] Scripts têm permissão de execução (chmod +x)
- [ ] Comandos são testáveis

## MCP Validation

### Configuration
- [ ] JSON válido em `~/.pi/agent/mcp-adapter.json` para `pi-mcp-adapter` (distinto do `mcp.json` nativo do PI)
- [ ] Cada server tem nome único
- [ ] `command` existe e é executável
- [ ] `args` são corretos
- [ ] `lifecycle` é um dos: lazy, eager, keep-alive
- [ ] `env` usa `${VAR}` para interpolação

### Testing
- [ ] `/mcp-status` mostra servidor
- [ ] Ferramentas aparecem em `/mcp-list`
- [ ] Nomes prefixados corretamente (`mcp_server_tool`)
- [ ] Sem conflitos com outras tools

## Post-Implementation

- [ ] `/reload` funciona sem erros
- [ ] Skill aparece em `/skill:name`
- [ ] Tools aparecem na lista
- [ ] Funcionalidade básica testada
- [ ] Logs verificados por erros
- [ ] Integração com restante do sistema validada
