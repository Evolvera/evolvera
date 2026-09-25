# Varredura brownfield — entender antes de mexer

Objetivo: transformar um projeto existente num backlog confiável de defeitos,
débitos, testes faltando, riscos de segurança e oportunidades — **com evidência**
— sem alterar nada. A varredura é somente leitura. Nada vira issue sem o seu OK.

## 1. Forma rápida (orquestrador, barato)
README, manifestos (`package.json`, `pyproject.toml`…), scripts, CI
(`.github/workflows`), estrutura top-level, `docs/copy-thief/mapa-do-projeto.md`
se já existir (reusar e só atualizar o que mudou desde o commit registrado nele).

## 2. Onda paralela de scouts (uma mensagem, todos em background)

Use `scout` para leitura de código. Cada prompt é autocontido, somente leitura,
com o foco do usuário (se houver) e o formato de achado abaixo.

| Scout | Pergunta |
|---|---|
| mapa | Stack, módulos, entrypoints, fluxos principais, integrações, onde ficam dados/auth. |
| testes-ci | Como rodar build/lint/testes; cobertura real por jornada; o que não tem teste; o CI passa? Recursos de estado que os testes tocam. |
| defeitos | Bugs prováveis com evidência (lógica, tratamento de erro, bordas, concorrência, TODO/FIXME perigosos). |
| seguranca | Entrada não validada, authz, segredos no repo, dependências vulneráveis (`npm audit --json`/`pip-audit` só leitura), OWASP Top 10. |
| debito | Duplicação, módulos gigantes, código morto, performance óbvia, configs frágeis. |
| ux-docs | Fluxos de usuário, telas, estados vazio/erro/carregando faltando, docs desatualizadas. |

Rodando a app localmente é seguro (contrato prova recursos descartáveis)? Então
um `qa` exploratório com Playwright MCP percorre os fluxos principais e registra
erros de console/rede e comportamentos quebrados. Senão, pule e registre a lacuna.

Opcional — **oportunidades**: `jina_read` em docs oficiais/produtos similares, ou
`deep-research` se o usuário pedir inovação/benchmark, para propor features ou
melhorias com fonte.

## 3. Formato de achado (todo scout devolve assim)

```yaml
- id: V-07
  tipo: Defeito | Débito | Segurança | Teste | Docs | Feature | Pesquisa
  titulo: "Login aceita e-mail vazio"
  onde: "src/auth/login.ts:42"
  evidencia: "trecho/comando/saída que prova"
  impacto: "o que quebra e para quem"
  confianca: alta | media | baixa
  severidade: P0 | P1 | P2 | P3
  risco: Trivial | Lógica | Sensível | Multi-sistema
  sugestao: "correção ou próximo passo"
```

## 4. Triagem (orquestrador)

1. Descartar sem evidência; mesclar duplicados (também com issues já abertas no repo).
2. `confianca: baixa` → vira `Pesquisa` (investigar), nunca correção direta.
3. Superfície que vai mudar e não tem teste → issue `Teste` de **baseline de
   caracterização** (captura o comportamento atual válido — não os bugs) e as
   mudanças nela ficam bloqueadas por ela.
4. Segurança P0/P1 e defeitos que quebram fluxo principal primeiro; depois
   baseline de testes; depois débito que destrava features; polimento por último.
5. Esforço GG → quebrar. Máximo sugerido por proposta: ~15 issues `Pronto`; o
   resto fica `Backlog`.

## 5. Proposta (um pacote, espera OK)

```md
## Copy Thief — varredura de OWNER/REPO (<data>, commit <sha>)
### Como entendi o projeto
- Stack / módulos / fluxos: ...
- Testes hoje: ... (o que roda, o que falta)
### Proposta de backlog
| # | Tipo | Título | P | Esforço | Risco | Evidência | Depende de |
|---|---|---|---|---|---|---|---|
### Oportunidades (com fonte)
### Descartado / fora de escopo
### Dúvidas que mudam o resultado
```

Após o OK: criar as issues (`references/github.md` §4–5), `Origem = Varredura`,
e uma issue `Docs` para gravar `docs/copy-thief/mapa-do-projeto.md` (stack,
módulos, comandos, fluxos, riscos, commit de referência) — o mapa economiza
tokens nas próximas varreduras.
