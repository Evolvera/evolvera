# Concepção greenfield — briefing → backlog

Entrada: briefing, transcrição, requisitos, prints ou notas — no chat, num arquivo
indicado ou na pasta `briefing/` do repo. Fonte da verdade do plano = o que está
nesses insumos + o que o usuário confirmar. O que não está escrito vira pergunta,
nunca suposição.

## Passos

1. **Ler e extrair** — objetivo real, usuários/papéis, fluxo principal de ponta a
   ponta, integrações (o que entra, o que sai, auth), regras de negócio,
   segurança, performance, restrições (stack, prazo, hospedagem).
2. **Prior art (rápido)** — 2–5 referências (produtos similares, docs oficiais da
   stack, padrões conhecidos) com `jina_read`; `deep-research` só se o usuário
   pedir benchmark/inovação. Registre o que vale "roubar" (padrões, não código).
3. **Perguntas no começo** — só as que mudam o resultado (stack com trade-off
   real, escopo ambíguo, regra de negócio conflitante). Agrupe numa mensagem
   com sugestão padrão para cada uma.
4. **Decompor** — épicos por área/fluxo; filhos pequenos (P/M), cada um com
   critérios de aceite testáveis (`references/github.md` §4). Ordem: fundação
   (repo, CI, testes, dados/auth) → regras de negócio → telas → integrações →
   bordas → docs/POP. A primeira issue de todo greenfield é "fundação de testes"
   (runner unitário + `@playwright/test` + CI mínimo).
5. **Telas** — cada tela vira seção da issue de UI a partir de
   `templates/docs/tela.md` (propósito, quem acessa, dados, ações, os 4 estados,
   regras). A construção é uma issue; a validação visual final é sua, com o POP
   como evidência.
6. **Proposta e OK** — mesma tabela da varredura (`references/varredura.md` §5)
   + decisões de arquitetura propostas. Após o OK: criar épicos, filhos,
   sub-issues e dependências no Project (`Origem = Briefing`). Decisões de
   arquitetura não óbvias viram ADR em `docs/adr/NNNN-titulo.md` dentro da issue
   de fundação.

A decomposição é o teto de tudo: se estiver errada, o loop será perfeito a
serviço da coisa errada. Em projeto grande, confirme a lista de épicos antes de
detalhar os filhos.
