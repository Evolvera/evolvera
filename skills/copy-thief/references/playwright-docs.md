# Playwright — testes, POP e relatório de execução

Duas ferramentas, papéis diferentes:

| Ferramenta | Para quê | Quem usa |
|---|---|---|
| **Playwright MCP** (`mcp` → servidor `playwright`) | Explorar a app viva, reproduzir defeito, tentar quebrar, ler console/rede, print avulso | `qa`/avaliador, varredura |
| **`@playwright/test`** (specs versionadas em `e2e/`) | Regressão repetível + fonte do POP e do relatório de execução | executor escreve; avaliador roda |

O MCP descobre; a spec prova e documenta. Nada que vire documento sai do MCP.

## Instalar no projeto (uma vez, numa issue "Fundação de testes")
```bash
npm i -D @playwright/test && npx playwright install chromium
mkdir -p e2e/support
cp <SKILL>/templates/playwright/documentador.ts e2e/support/documentador.ts
```
`playwright.config.ts`: `testDir: 'e2e'`, `use: { baseURL, trace: 'on-first-retry' }`,
`retries: 1` no CI, `webServer` subindo a app local (comando do contrato).

## Boas práticas (obrigatórias nas specs)
- Localizadores de usuário: `getByRole`, `getByLabel`, `getByText`; `data-testid` só se não houver alternativa. Nunca CSS/XPath frágil.
- Asserções com espera: `await expect(locator).toBeVisible()/toHaveText()`; nunca `waitForTimeout`.
- Cada teste isolado: cria seus próprios dados (sintéticos) e não depende de outro.
- Uma spec por fluxo de usuário; nome do arquivo = fluxo (`e2e/cadastro-cliente.spec.ts`).
- Falha → abrir o trace (`npx playwright show-trace`), achar a causa; **proibido** enfraquecer asserção para passar.

## Spec documentada (POP + execução) — padrão POP Enpro
O POP gerado segue o padrão dos POPs de referência do usuário (Cariacica Down,
Controle de Evidências): tabela de cabeçalho (Nº, Título, Versão, Equipe, datas),
12 seções fixas com linha azul-marinho, atividades `1.` / `1.1`, figuras com
vários elementos marcados (caixa vermelha `#ED3237` + seta curta + bolinha
numerada), "Figura N – …" em cima, "Fonte: Elaborado pelo autor (ano)."
embaixo, legenda numerada (aceita `**negrito**`), logos em toda página e
número de página no rodapé.

Use o `test` de `e2e/support/documentador.ts` (exemplo completo em
`templates/playwright/exemplo-pop.spec.ts`):

```ts
test('cadastro de cliente', async ({ page, doc }) => {
  doc.iniciar({ fluxo: 'cadastro-cliente', titulo: 'Cadastro de clientes' });
  await page.goto('/clientes');
  doc.atividade('Cadastrar um cliente, tela /clientes (uso do atendente)', 'Texto de abertura.');
  await doc.tela('Conhecer a tela', 'Ao abrir, a tela mostra…', [            // 1 print, N marcas
    { alvo: page.getByRole('button', { name: 'Novo cliente' }), rotulo: 'Botão **Novo cliente**.' },
    { alvo: page.getByRole('list'), rotulo: 'Lista de clientes.' },
  ], { legenda: 'Tela inicial de clientes' });
  await doc.passo('Abrir o formulário', 'Clique em "Novo cliente".',            // marca + ação
    page.getByRole('button', { name: 'Novo cliente' }), a => a.click(),
    { atencao: 'Só aparece para o perfil Atendente.' });
});
```

| API | Efeito |
|---|---|
| `doc.atividade(título, intro?)` | Abre "1. …"; passos seguintes viram 1.1, 1.2… |
| `doc.tela(título, texto, marcas[], opções?)` | Um print com vários elementos numerados + legenda; sem ação |
| `doc.passo(título, texto, alvo?, ação?, opções?)` | Marca o alvo, fotografa e executa a ação |
| opções | `legenda` (título da figura), `rotulo`, `atencao` ("Atenção:"), `telaInteira` (sem recorte) |

O print é recortado automaticamente em volta das marcas (mín. 900×420) — use
`telaInteira: true` para a janela toda. Títulos e textos em pt-BR, para o
usuário final ("Clique em Salvar"), não para dev. Sem `CT_DOCS=1` nada é
capturado — a spec roda como teste normal e rápido.

**Conteúdo textual do POP** fica em `docs/pop/<fluxo>.pop.json` (Nº, versão,
equipe, datas, descrição, objetivos, público-alvo, pré-requisitos, material,
resultados esperados, ações corretivas, suporte, participantes, histórico,
observações). Na primeira geração ele é criado com `⟨preencher⟩` (destacado em
amarelo no POP). O executor preenche o que o briefing/issue permite; o resto
vira pendência `precisa-humano`. Ao regenerar por mudança de tela: incrementar
`versao`, atualizar `dataRevisao` e adicionar linha em `historico`.

**Identidade visual** (opcional) em `docs/pop/_marca.json`:
```json
{ "logoEsquerda": "docs/pop/marca/cliente.png", "logoDireita": "docs/pop/marca/empresa.png",
  "estiloAnotacao": "seta", "corAnotacao": "#ED3237", "corLinha": "#2B2B8C",
  "fonteFigura": "Fonte: Elaborado pelo autor ({ano})." }
```
`estiloAnotacao`: `seta` (padrão, estilo Controle de Evidências) ou `bolinha`
(estilo Cariacica: bolinha à esquerda da caixa, sem seta).

## Gerar os documentos
```bash
CT_DOCS=1 CT_ISSUE=<n> CT_SHA=$(git rev-parse --short HEAD) npx playwright test e2e/<fluxo>.spec.ts --project=chromium
```
Saída (HTML autocontido com as imagens embutidas + PDF gerado dele):

| Arquivo | Quando | Para quem |
|---|---|---|
| `docs/pop/<fluxo>.html` / `.pdf` | só se o teste passou (POP de fluxo quebrado não existe) | usuário final: como usar o sistema |
| `docs/execucoes/<data>-issue-<n>-<fluxo>.html` / `.pdf` | sempre | você: como o teste rodou — resultado, passos, tempos, console, rede, prints |

Por que HTML + PDF: o HTML é o mais barato de gerar (o próprio teste escreve);
o PDF sai dele numa chamada `page.pdf()` e é o que o GitHub mostra renderizado
no navegador. As setas estão gravadas nas imagens, então valem nos dois.

## Onde isso entra no loop
- Executor: toda issue que cria/altera fluxo de UI entrega a spec documentada e os arquivos gerados na mesma branch; CA "POP atualizado" no corpo da issue.
- Avaliador: roda a suíte, abre o relatório de execução, confere prints × critérios de aceite; explora com o MCP o que a spec não cobre.
- `ct:retro` e campo `Evidência` do Project linkam o PDF do relatório (e o do POP).
- `docs/pop/index.md` (mantido pelo modo `docs`): lista de fluxos → link para cada POP. É o manual do sistema.
- Mudou a tela? `/skill:copy-thief docs <fluxo>` regenera — nada de print manual.

## Tamanho e higiene
Prints em JPEG q80. Relatórios de execução antigos: manter só o último por
fluxo+issue (o histórico fica no git). Nunca capture dados reais/pessoais: use
dados sintéticos nas specs.
