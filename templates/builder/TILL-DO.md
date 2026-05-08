## Builder TILL-DO Gates

- [ ] PROPÓSITO DEFINIDO: Frase clara do que implementar
- [ ] FILE STRUCTURE MAPEADA: Estrutura de diretórios do projeto identificada
- [ ] ESCOPO DEFINIDO: Quais fases serão executadas (neste builder run)
- [ ] HANDOVER AFTER EACH PHASE UNDERSTOOD: Entendido que este builder FAZ APENAS UMA FASE e entrega ao próximo
- [ ] BRANCH CRIADA: `git checkout -b agent/<timestamp>-<desc>` feito
- [ ] BASE COMMIT ANOTADO: Hash do commit base salvo
- [ ] ROLLBACK DEFINIDO: Como voltar atrás se algo falhar

⚠️ **GATE BLOQUEANTE**: Não começar implementação até TODOS os gates 100% ✅

---

## ⚠️ REGRA CRÍTICA: HANDOVER AFTER EACH PHASE

Este builder FAZ **APENAS UMA FASE** por execution. Após completar a fase atual:

1. Commit: `git add -A && git commit -m "feat: Phase N complete — [desc]"`
2. Output: HANDOVER BLOCK no final
3. **PARAR** — não iniciar próxima fase
4. Aguardar que o agente pai chame novo builder para próxima fase

**NUNCA FAÇA:**
- ❌ Múltiplas fases em um builder run
- ❌ "Vou fazer rapidão as próximas fases também"
- ❌ Continuar para fase seguinte sem entregar

**SEMPRE FAÇA:**
- ✅ Complete a fase atual
- ✅ Commit o resultado
- ✅ Output HANDOVER BLOCK
- ✅ Signal completion
