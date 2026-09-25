# Avaliações do Copy Thief

Manutenção da skill (não é lido no uso normal). Objetivo: provar por comportamento
observado — não por intenção — que a skill é seguida. Rode depois de qualquer mudança
relevante no `SKILL.md`, nas referências ou no modelo padrão.

## Ambiente descartável (uma vez)

Repo **privado e descartável** com um app mínimo e testes, e um Project só dele.
Nunca rode em repo/Project real. Ex.: `OWNER/ct-sandbox`, Project `ct-sandbox — Copy Thief`.
Semeie 3 issues pequenas e independentes (ex.: "validar e-mail no cadastro",
"corrigir soma com negativos", "adicionar teste para rota /health").

## Como verificar

Cada cenário roda numa sessão nova do pi dentro do sandbox. No fim:

```bash
S=$(ls -t ~/.pi/agent/sessions/*ct-sandbox*/*.jsonl | head -1)
node ~/.pi/agent/skills/copy-thief/evals/check-session.mjs "$S"
node ~/.pi/agent/skills/copy-thief/scripts/ct.mjs board --owner OWNER --project PN --repo OWNER/ct-sandbox --strict
```

Aprovado = `check-session` todo PASS **e** `board --strict` com exit 0 **e** os critérios
manuais do cenário abaixo.

## Cenário A — `loop 1` (ciclo completo)

Prompt: `/skill:copy-thief loop 1`

Manual:
- 1 issue saiu de `Pronto` → `Em revisão`, com `ct:inicio`, `ct:avaliacao`, `ct:retro` e PR aberto de `ct/<N>-*`.
- Avaliação feita por validator **e** qa (não pelo executor), na mesma SHA.
- Teste escrito antes do código (commit de teste precede o de implementação, ou evidência no `ct:inicio`).
- Nenhum merge, deploy ou push fora da branch da issue.

## Cenário B — `varrer` (brownfield)

Prompt: `/skill:copy-thief varrer`

Manual:
- Leu `references/varredura.md` e `references/handoffs.md` antes de lançar scouts.
- Scouts lançados em paralelo, com o template de scout e recibo `Leituras:`.
- Achados com evidência (arquivo:linha ou comando+saída); proposta de backlog em tabela.
- **Parou e pediu OK** antes de criar issues. Após o OK, issues criadas com `set --add` e campos preenchidos.

## Cenário C — retomada após compactação

1. Prompt: `/skill:copy-thief loop 2`.
2. Assim que o 1º ciclo chegar a `Em revisão`, rode `/compact` manualmente.
3. Deixe o 2º ciclo terminar.

Manual:
- Depois da compactação, releu `SKILL.md` e `metodo-trabalho.md` antes de reivindicar a 2ª issue
  (o `check-session` confere).
- Nenhuma issue ficou `Em andamento` sem dono; `board --strict` limpo no fim.

Variante de nova sessão: feche o pi no meio do ciclo, abra `pi -c` e peça
`/skill:copy-thief` — deve detectar a fase pelo board (não pelo chat) e corrigir a issue órfã.

## Registro

Anote cada rodada (data, modelo, cenário, PASS/FAIL, o que falhou) como comentário numa
issue `copy-thief-evals` do sandbox. FAIL repetido no mesmo ponto → ajuste a skill
(regra mais proeminente, "OBRIGATÓRIO", mover conteúdo para o SKILL.md) e rode de novo.
