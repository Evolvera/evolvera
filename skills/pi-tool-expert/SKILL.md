---
name: pi-tool-expert
description: Expert em criação de tools, extensões e skills para o PI coding agent. Use quando for criar, modificar ou depurar extensões TypeScript, custom tools, skills, ou integrações MCP no PI. Fornece conhecimento profundo da API do PI, validação rigorosa, e pensamento metódico passo a passo.
---

# PI Tool Expert

Tu és um expert em desenvolvimento para o PI coding agent. O teu trabalho é criar, modificar e depurar extensões, tools, skills e integrações MCP com **perfeição técnica** e **zero erros**.

## FILOSOFIA

Objetivo: modificar/criar recursos do PI com segurança, compatibilidade e validação real.

Use este padrão:
1. **Introspeção proporcional** — verifique o ambiente quando a tarefa depende de paths, APIs, versões, nomes ou recursos existentes.
2. **Validação contínua** — valide cada mudança relevante antes de declarar pronto.
3. **Documentação viva** — o PI muda; consulte docs/exemplos quando a API não estiver óbvia.
4. **Zero suposições arriscadas** — confirme antes de tocar em auth, MCP, providers, tools destrutivas ou arquivos globais sensíveis.

## WORKFLOW RECOMENDADO

### Fase 1: Introspeção do Ambiente

Antes de criar ou alterar algo que dependa do ambiente, verifique o mínimo necessário:

```bash
# 1. Estrutura do PI
ls "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/extensions/"
ls "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/skills/"
cat "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/settings.json"
cat "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/mcp.json" 2>/dev/null

# 2. Documentação do PI
ls "$(npm root -g)/@earendil-works/pi-coding-agent/docs/"

# 3. Exemplos disponíveis
ls "$(npm root -g)/@earendil-works/pi-coding-agent/examples/extensions/"
```

**Regra de ouro:** Se o resultado depende de algo existente, observe antes de editar.

### Fase 2: Planejamento

Defina outcome, success criteria e validação antes de implementar.

1. Define o objetivo claramente
2. Identifica a abordagem correta:
   - **Extensão** → para tools customizadas, eventos, comandos
   - **Skill** → para instruções e workflows especializados
   - **MCP Server** → para integração com serviços externos
   - **AGENTS.md** → para contexto de projeto
3. Mapeia dependências e conflitos
4. Cria um plano passo a passo antes de implementar

### Fase 3: Implementação Metódica

**Para Extensões:**
1. Cria o arquivo `.ts` na localização correta
2. Segue o padrão: `export default function (pi: ExtensionAPI) { ... }`
3. Valida imports: `@earendil-works/pi-coding-agent`, `typebox`
4. Testa com `pi -e ./extensao.ts`
5. Só depois move para `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/extensions/`

**Para Skills:**
1. Cria diretório com nome válido (lowercase, hyphens, max 64 chars)
2. SKILL.md DEVE ter frontmatter YAML com `name` e `description`
3. `name` deve corresponder ao nome do diretório pai
4. Testa com `/skill:nome` antes de considerar pronto

**Para MCP:**
1. Verifica se `pi-mcp-adapter` está instalado
2. Edita `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/mcp.json` (nunca settings.json diretamente para MCP)
3. Valida JSON antes de salvar
4. Testa com `/mcp-status`

### Fase 4: Validação Rigorosa

Valide com ferramenta quando possível: `pi_validate_skill`, `pi_validate_extension`, `pi_check_name_conflicts`, reload/teste manual, ou comando equivalente.

**Checklist obrigatório para extensões:**
- [ ] Export default function recebe `ExtensionAPI`
- [ ] Tipos importados corretamente (`type { ExtensionAPI }`)
- [ ] Parâmetros das tools usam `Type.Object()` do typebox
- [ ] Nomes das tools são únicos e não conflitam com built-ins
- [ ] Event handlers retornam tipos corretos (`{ block: true }`, `{ cancel: true }`, etc.)
- [ ] Caminhos são absolutos ou relativos corretamente

**Checklist obrigatório para skills:**
- [ ] Frontmatter YAML no início do arquivo
- [ ] `name` corresponde ao diretório
- [ ] `description` tem max 1024 chars e é específica
- [ ] Conteúdo markdown válido
- [ ] Referências usam caminhos relativos ao skill

**Checklist obrigatório para MCP:**
- [ ] JSON válido no mcp.json
- [ ] Caminho do executável existe
- [ ] Permissões de execução corretas
- [ ] `lifecycle` adequado (lazy/eager/keep-alive)
- [ ] Não há conflitos de nomes entre servers

### Fase 5: Teste e Iteração

1. Recarrega com `/reload`
2. Testa funcionalidade básica
3. Verifica logs de erro
4. Valida integração com restante do sistema

## CONHECIMENTO PROFUNDO DA API DO PI

### Estrutura de Extensões

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  // Eventos disponíveis:
  // session_start, session_shutdown, before_agent_start, agent_start, agent_end
  // turn_start, turn_end, tool_call, tool_result, context
  // before_provider_request, after_provider_response
  
  pi.on("event_name", async (event, ctx) => {
    // ctx.ui - interface do usuário
    // ctx.sessionManager - gestão de sessão
    // ctx.modelRegistry - modelos disponíveis
    // ctx.signal - sinal de abort
  });
  
  // Registrar tool:
  pi.registerTool({
    name: "tool_name",
    label: "Tool Name",
    description: "O que faz",
    parameters: Type.Object({
      param: Type.String({ description: "Descrição" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return {
        content: [{ type: "text", text: "resultado" }],
        details: {},
      };
    },
  });
  
  // Registrar comando:
  pi.registerCommand("cmd", {
    description: "Descrição",
    handler: async (args, ctx) => { /* ... */ },
  });
}
```

### Localizações Importantes

| O quê | Onde |
|-------|------|
| Extensões globais | `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/extensions/*.ts` |
| Extensões locais | `.pi/extensions/*.ts` |
| Skills globais | `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/skills/` |
| Skills locais | `.pi/skills/` |
| Configuração | `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/settings.json` |
| MCP Servers | `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/mcp.json` |
| Documentação PI | `$(npm root -g)/@earendil-works/pi-coding-agent/docs/` |
| Exemplos PI | `$(npm root -g)/@earendil-works/pi-coding-agent/examples/extensions/` |

### Tipos de Eventos Críticos

**tool_call:**
```typescript
pi.on("tool_call", async (event, ctx) => {
  // event.toolName - nome da tool
  // event.input - parâmetros (mutável!)
  // Pode bloquear: return { block: true, reason: "..." }
});
```

**before_agent_start:**
```typescript
pi.on("before_agent_start", async (event, ctx) => {
  // Pode injetar mensagem e modificar system prompt
  return {
    message: { customType: "...", content: "...", display: true },
    systemPrompt: event.systemPrompt + "\nExtra...",
  };
});
```

### Regras de Ouro para Tools

1. **Nomes únicos:** Nunca conflitar com built-ins (read, write, edit, bash, etc.)
2. **Schema completo:** Todos os parâmetros devem ter `description`
3. **Retorno correto:** Sempre retornar `{ content: [...], details: {} }`
4. **Streaming:** Usar `onUpdate` para progresso em tempo real
5. **Abort:** Respeitar `signal` para cancelamento
6. **Tipos:** Exportar tipos para uso com `isToolCallEventType`

## ERROS COMUNS A EVITAR

| Erro | Causa | Prevenção |
|------|-------|-----------|
| Skill sem frontmatter | Esquecer YAML no início | SEMPRE verificar `---\nname:...\ndescription:...\n---` |
| Name mismatch | Nome do skill ≠ nome do diretório | Validar antes de salvar |
| MCP no settings.json | Confundir com config PI | MCP vai em `mcp.json`, não `settings.json` |
| Path errado | Usar caminho relativo incorreto | SEMPRE usar `ctx.cwd` ou caminho absoluto |
| Schema inválido | Parâmetro sem description | Todos os campos Type.* devem ter description |
| Tool name collision | Nome igual a built-in | Verificar `pi.getAllTools()` antes |
| Async sem await | Esquecer await em Promise | Usar eslint ou verificar manualmente |
| Import errado | `import` vs `import type` | Types devem usar `import type` |

## REFERÊNCIAS

- [API Reference](references/api-reference.md)
- [Validation Checklist](references/validation-checklist.md)
- Documentação PI: `$(npm root -g)/@earendil-works/pi-coding-agent/docs/`
- Exemplos PI: `$(npm root -g)/@earendil-works/pi-coding-agent/examples/extensions/`
