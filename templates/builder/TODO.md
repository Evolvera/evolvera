## Builder TODO — Phase N: [Phase Name]

**⚠️ IMPORTANTE**: Execute apenas esta fase. Não avance para próxima.

### Phase N: [Nome da Fase]

- [ ] **Step 1**: [Descrição do step]
  - FILE: `caminho/arquivo.tsx`
  - OLD: [descrição ou link para código existente]
  - NEW: [descrição do que criar/modificar]
  - VERIFICATION: [como verificar que funcionou]

- [ ] **Step 2**: [Descrição do step]
  - FILE: `caminho/arquivo.tsx`
  - OLD: [descrição]
  - NEW: [descrição]
  - VERIFICATION: [como verificar]

- [ ] **Step N**: [Último step da fase]
  - FILE: `caminho/arquivo.tsx`
  - OLD: [descrição]
  - NEW: [descrição]
  - VERIFICATION: [como verificar]

### Phase Completion

- [ ] Todos os steps commits feitos: `git log --oneline`
- [ ] Tests passing (se houver)
- [ ] Build passing (se aplicável)
- [ ] Phase N delivery confirmed

### 🔄 HANDOVER BLOCK (OUTPUT THIS AT END OF PHASE)

```markdown
## 🔄 Phase N Handover

**Phase**: N — [Phase Name]
**Branch**: `agent/<timestamp>-<desc>`
**Status**: PHASE_COMPLETE
**Commits**: [N commits on branch]

### What was done:
- [ ] Step 1: [description] → committed
- [ ] Step 2: [description] → committed
- ...

### What remains:
- [ ] Phase N+1: [next phase name]
- [ ] Phase N+2: [next phase name]

### Current branch state:
- Branch: `agent/<timestamp>-<desc>`
- Last commit: [hash] — [message]
- Files modified: [count]

### Next builder call:
```
Agent(subagent_type="builder", prompt="Continue from Phase N+1. Branch: agent/<timestamp>-<desc>. Base commit: [hash].")
```

[ ] Phase N delivery confirmed — AWAITING NEXT BUILDER
```

---

## ⚠️ CHECKLIST ANTI-ALUCINAÇÃO

Antes de fazer handover, verifique:

- [ ] Todo código implementado foi VERIFICADO (não假设, não "deveria funcionar")
- [ ] Nenhum console.log ou debug leftover
- [ ] Nenhum TODO/FIXME esquecido no código
- [ ] Nenhuma credential ou secret hardcoded
- [ ] Import statements corretos
- [ ] Nenhum arquivo não utilizado criado

## Próximas Fases (PARA REFERÊNCIA — NÃO EXECUTAR AGORA)

- [ ] Phase N+1: [Nome]
- [ ] Phase N+2: [Nome]
- [ ] Phase N+3: [Nome]

**HANDOVER NOW — DO NOT CONTINUE TO NEXT PHASE**
