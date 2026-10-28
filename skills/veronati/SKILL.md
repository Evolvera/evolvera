---
name: veronati
description: 'VeroNati é o padrão de design, UI/UX e texto de Natiam e Verônica. Use SEMPRE que for começar um sistema novo ou mexer num existente, e em qualquer tela, componente, card, gráfico, formulário, modal, sidebar, dashboard, relatório, PDF, apresentação ou mensagem que alguém vai ler, mesmo que o pedido não diga "VeroNati" nem "design". Impõe: interface limpa com explicação no (i), cards cheios e da mesma altura, sem lacunas brancas, todo número acompanhado de gráfico ou visual (feito com ApexCharts pela skill apexcharts), nenhum travessão ou " - ", escala tipográfica mínima de 12px, bastante filtro e igual em todo o sistema (tempo predefinido e personalizado, entidade, combináveis, na URL), cards e gráficos clicáveis e interativos, tema seguindo o sistema, dado de exemplo sempre avisado, sem cara de IA (sem estrelinhas, degradê roxo, emoji ou verbo vazio), termos da equipe, e entrega de ajuste com foto antes x depois. Vale também para revisar o que outro agente entregou e para ajustes pedidos em reunião, transcrição ou print.'
---

# VeroNati

Padrão de Natiam e Verônica, nascido de revisões tela a tela e de correções feitas em cima de prints reais. Uma ideia guia tudo: **quem usa bate o olho e entende; a explicação mora no (i); nada sobra, nada falta, nada fica vazio.**

Serve para dois momentos:
- **Sistema novo:** monte desde o primeiro componente com estas regras (seção 6 tem o kit inicial).
- **Sistema existente:** audite primeiro (seção 7), corrija no sistema inteiro, não só na tela citada.

Leia este arquivo inteiro antes de mexer em interface. Os casos concretos, com data e frase de origem, estão em `references/decisoes.md`. Antes de entregar, passe `references/checklist.md` e rode `scripts/varrer.py`.

## 1. As regras que não se negociam

1. **Explicação vai para o (i).** Subtítulo de página, subtítulo de card, nota de rodapé, legenda de cores, ajuda de campo, "como ler", "como funciona": vira um ícone (i) ao lado do título a que pertence, com pop-up curto. O que é só data ou contagem ("recorte: outubro de 2026", "11 widgets ativos") some, porque o filtro já diz. Fica à vista só o que é estado (erro, aviso) ou o que tem botão ou link dentro.
   Por quê: "deixa tudo no izinho do lado; as primeiras vezes eles podem ter dúvida, mas depois vai ficar só sendo lixo visual".
2. **Nenhum travessão.** Proibido "—", "–", " - " e "|" como separador em qualquer texto lido por alguém: tela, botão, toast, e-mail, PDF, mensagem. Use "·" com espaço dos dois lados, " / " entre dados lado a lado, dois-pontos ou quebra em título + apoio. Opção de lista nunca começa com "·". Dado vindo do banco passa por um filtro antes de aparecer.
3. **Card cheio, mesma altura, sem buraco.** Cards de uma fileira têm a mesma altura (o invólucro estica, o card ocupa o invólucro). Card com pouco conteúdo ganha algo útil (mini gráfico, segunda métrica, exemplo avisado) ou fica menor. Bloco ao lado de outro maior não deixa meia coluna branca: o menor ganha conteúdo ou a disposição muda. O grid fecha as fileiras.
4. **Número nunca sozinho: sempre com um visual.** Sempre que possível, todo número vem acompanhado de algo que se vê: barra de progresso com marca de "hoje", sparkline da tendência, mini rosca de %, barras por categoria, funil, gauge, "2/5" com barrinha, seta e cor da variação. Gráfico antes de parágrafo. Indicadores que a pessoa acompanha ficam juntos num card (ex.: CPL, CAC e ROI, cada um com sua minitendência). Legenda no canto direito, na linha do título. Número puro só quando não existe série nem referência (e aí ele ganha ao menos a comparação com o período anterior).
   **Gráficos com ApexCharts:** carregue a skill `apexcharts` (/apexcharts) antes de escrever o primeiro gráfico e siga o que ela manda (tipo certo, formato dos dados, formatadores, ciclo de vida). Veja a seção 2.1.
5. **Tipografia legível** (seção 2). Nada abaixo de 12px.
6. **Tudo clica, é interativo e leva ao lugar certo.** Card de número abre a tela filtrada naquele recorte, aplica o filtro na própria tela ou abre um pop-up com o detalhe. Item de gráfico também clica (barra, fatia, ponto) e filtra pelo que representa. Hover mostra o detalhe. Clicável tem cara de clicável (cursor, realce no hover, foco por teclado). Clicar e nada acontecer é defeito. Lista longa vira card com os 10 últimos e pop-up grande com rolagem e filtro.
7. **Dado de exemplo nunca se passa por real.** Sem dado real, mostre exemplo com aviso claro ("dados demonstrativos") e diga em uma linha o que resolve ("enviar a exportação de leads do CRM"). Exemplo e real nunca se somam. Nada hardcoded: número vem do banco, de planilha importada, de API ou de LLM.
8. **Termo da equipe, não do sistema.** Use a palavra que quem usa fala (Standby, data limite, atividade). Nome que fez alguém perguntar "o que é isso?" está errado e troca na hora, em todo lugar.
9. **Sem cara de IA** (seção 4.1): nada de estrelinhas/brilho como ícone, degradê roxo, neon, emoji ou verbo de propaganda vazio; ícone e texto dizem o que a coisa é.
10. **Um jeito de fazer cada coisa.** Não duplicar comando (seletor de produto na lateral e de novo numa fileira de chips; botão que repete o que um clique já faz). Sobrou, sai.

## 2. Tipografia (escala combinada)

| O quê | Onde | Tamanho |
|---|---|---|
| Etiqueta / selo | status, "dados demonstrativos", contadores de aba | 12px |
| Rótulo de card em caixa alta | nome acima do número | 12px, letter-spacing ~0,6px |
| Seção do menu | agrupadores da lateral | 12px |
| Cabeçalho de tabela | primeira linha | 12px |
| Texto auxiliar | linha embaixo do número, eixos, legendas, rodapé | 12px |
| Título de seção | título de bloco dentro da página | 13px |
| Comparação com o período anterior | variação embaixo do número | 13px |
| Caixa de aviso | frase inteira com ícone e fundo | 14px |
| Corpo explicativo | orientação, lista vazia, filtro ativo | 14px |
| Linha de tabela | conteúdo das tabelas | 14px |
| Item do menu lateral | links do menu | 14px |
| Título de card | | 15 a 16px, peso 700 |
| Número grande do card | | 24 a 32px, peso 800, `tabular-nums` |
| Título da página | | 26 a 30px, peso 800 |

Regras: um tipo de letra sans de sistema bem legível (Inter ou equivalente) e uma mono só para números alinhados e códigos; números sempre em `tabular-nums`; moeda curta nos cards (R$ 551K, R$ 4,7M) e cheia nas tabelas e no detalhe (R$ 551.080,59); datas no padrão do país (16/10/2026).

## 2.0 Paleta e acabamento padrão: verde floresta suave

Pedidos de 27/10/2026: "o preto não está preto"; "está puxando muito pra um verde, um azul ciano neon"; depois, sobre o cobalto: "algumas cores ficaram mortas... esse azul, esse vermelho muito forte, essas letras não precisam ser todas pretas... aquele contraste do branco com aquele verde estava legal... nada chamativo igual inteligência artificial... os gráficos ficaram muito fortes, nada agradável ao olhar humano". Vale para todo sistema novo, salvo marca com cor própria. Referências: skills taste-skill e soft-skill.

**Cores (tokens)**
- Base neutra levemente quente, sem tom azulado ou esverdeado. Claro: fundo `#f8f8f7`, superfície `#ffffff`, borda `#e8e8e5`.
- **Texto grafite, nunca preto:** `#26292c` / `#5b6166` / `#83888d` no claro; `#ececee` / `#a5a5ad` / `#83838c` no escuro.
- **Escuro é preto de verdade:** fundo `#09090b`, superfície `#121214`, borda `#232327`. Nunca azul-marinho, verde-petróleo nem `#000`.
- **Um único acento, verde floresta:** `#1f6f5c` no claro (botão principal verde com texto branco, links, menu ativo, foco) e verde sálvia `#7cc4a0` no escuro (botão com texto `#07130d`). Nada de verde-água, ciano ou neon; nada de azul forte como acento.
- **Estado só como estado, em tom suave:** verde `#2f7a58`/`#7cc4a0`, vermelho tijolo `#b0503f`/`#ec8d7d`, âmbar `#94680f`/`#e3bd6b`, cada um com fundo bem claro (claro) ou 12% de transparência (escuro).

**Gráficos (ApexCharts)**
- Tokens próprios e suaves: série principal `--grafico-1` (verde `#4f9a7c` / `#6db893`), erro ou contraste `--grafico-2` (coral `#e2917f` / `#de8a7a`), resto `--grafico-3` (cinza). Nunca vermelho puro, azul saturado ou a paleta padrão da biblioteca.
- Barras com canto arredondado só na ponta (`borderRadiusApplication: "end"`, `borderRadiusWhenStacked: "last"`), colunas finas (~46%), preenchimento a 92%, grade tracejada só horizontal, legenda com bolinhas, sparkline com gradiente leve (22% para 0), rosca fina (74%) com separação na cor da superfície, trilho do radial no tom suave do acento. Eixo de contagem só com inteiros. Animação de entrada curta (desliga com "reduzir movimento").

**Tipografia**
- Plus Jakarta Sans (variável, licença OFL) servida pelo próprio sistema (`@font-face` com woff2 latin e latin-ext, `font-display: swap`; liberar `font-src 'self'` na CSP). Inter não é o padrão. No cartão dentro do ChatGPT ou do Claude, a fonte do sistema do usuário.

**Acabamento e movimento (sem cara de IA)**
- Sombra difusa e quase invisível (`0 1px 2px` + `0 10px 28px -16px`, com 4% a 12% de opacidade), nunca colorida nem escura; bordas finas e claras; raio 14px nos cards.
- Transições com curva natural `cubic-bezier(.32,.72,0,1)`, nunca linear: card clicável sobe 2px no hover com sombra um pouco maior; botão afunda levemente ao clicar (`scale(.98)`).
- Entrada suave dos blocos ao abrir a tela (sobe 10px e aparece, 0,6s, em sequência de 50ms), modal surge com leve escala. Tudo some com `prefers-reduced-motion`.
- Proibido: brilho neon, degradê chamativo, vidro fosco em tudo, animação em loop, cores saturadas.
- **Cartão dentro do ChatGPT ou do Claude (MCP Apps):** fundo transparente, superfícies translúcidas no escuro (`rgba(255,255,255,.045)`), mesmos tons.

## 2.1 Gráficos (ApexCharts)

- **Biblioteca:** ApexCharts, sempre pela skill `apexcharts`. Em React, Vue ou Angular use o pacote do framework (`react-apexcharts`, `vue3-apexcharts`, `ng-apexcharts`). Se a página tem CSP só com `'self'` (sem CDN), copie o build para `vendor/` e carregue por `<script src>`; nada de script inline.
- **Qual gráfico para qual número:**
  - progresso contra meta ou plano: `radialBar` ou barra horizontal com marca de "hoje";
  - tendência de um número no card: `sparkline` (área ou linha, sem eixos, 40 a 60px de altura);
  - composição (ex.: planejado / contratado / pago): barra empilhada 100% ou `donut`;
  - comparação entre categorias (origens, produtos, pessoas): barras horizontais ordenadas;
  - funil (leads → vendas): `funnel` ou barras horizontais decrescentes com % da etapa;
  - mês a mês: colunas, ou `heatmap` quando são muitas séries;
  - variação contra o período anterior: seta + cor, ou coluna dupla.
- **Visual combinado com o padrão:** cores do tema (os mesmos tokens da interface, nunca a paleta padrão da biblioteca); cor com significado fixo em todo o sistema (ex.: cada estado com uma cor só, em todas as telas; verde = bom, vermelho = atenção); fonte do sistema, rótulos e eixos em 12px; sem título interno no gráfico (o título é o do card, com (i)); tooltip em português com moeda e data no formato do país; `toolbar` escondida em cards pequenos; animação curta.
- **Sem buraco:** o gráfico ocupa a altura que sobra do card (é ele que preenche o card mais baixo da fileira). Sem dado, mostre o exemplo avisado com o gráfico, não um card vazio.
- **Tema claro e escuro:** troque `theme.mode` e as cores junto com o tema da página; destrua e recrie o gráfico ao sair da tela (sem vazamento).
- **Acessível e imprimível:** o número continua escrito ao lado do gráfico; o gráfico nunca é a única forma de ler o valor.

## 3. Layout e componentes

- **Tema segue o sistema por padrão** (Automático), com Claro e Escuro sempre à mão no topo (três ícones: sol, lua, monitor). O escuro é preto de verdade (#09090b, ver seção 2.0), não azul-marinho nem verde-escuro. A escolha fica salva e é aplicada antes do primeiro desenho, sem piscar.
- **Cabeçalho da página:** título + (i) à esquerda; à direita, na mesma linha, os comandos (escopo/produto, período, ação principal). Botões espalhados sobem para essa linha. Sem trilha "Início › Tela" que não leva a lugar nenhum.
- **Bastante filtro, e igual em todo o sistema** (uma barra de filtros reutilizável, o mesmo componente em todas as telas):
  - **Tempo:** predefinidos (hoje, últimos 7 dias, semana atual, mês atual, últimos 30 dias, trimestre, ano atual, ano anterior) e **personalizado** (intervalo de datas). Começa em "semana atual". Rótulos curtos: "Outubro 2026", "2026", "Semana atual · 12/10 a 16/10".
  - **Entidade:** empresa, produto, escopo, cliente, responsável, tipo, status, o que a tela tiver; seleção de um ou vários, com busca.
  - Os filtros **combinam entre si**, aparecem como chips removíveis com "Limpar filtros", ficam na **URL** (link compartilhável e voltar do navegador) e valem para **todos** os cards, gráficos e tabelas da tela.
  - Filtro ativo é sempre visível; nada filtra "escondido".
- **Cabe na tela, em qualquer tela:** notebook, PC, tablet e celular de vários tamanhos. Teste ao menos 1280x720, 1366x768, 1440x900, 1536x864, 1920x1080, 2560x1440, 768x1024, 1024x768, 360x800, 375x667 e 390x844. Telas de entrada e painéis cabem inteiros sem rolagem no desktop, notebook e tablet (100dvh, tamanhos com clamp(), media queries por ALTURA além de largura); em monitor grande aproveitam o espaço em vez de ficar uma ilha no centro. No celular o principal (formulário, número, ação) aparece sem rolar. Nunca rolagem horizontal.
- **Topo da tela = o que importa agora:** cards de resumo (um por estado/indicador, cada um com (i)), depois a área de trabalho (lista, kanban, gráfico).
- **Menu lateral:** grupos que abrem e fecham pela seta (estilo ERP), o grupo da tela atual abre sozinho; troca de produto/escopo também na lateral. Canto do usuário com foto, nome e papel em destaque e "Sair" como ícone pequeno e discreto.
- **Cards:** borda arredondada, sombra leve, padding igual em todos, mesma altura na fileira, título + (i) + ação curta ("Abrir →") na mesma linha.
- **Tabelas e listas:** poucas colunas, as que a pessoa preenche ou confere; cabeçalho fixo ao rolar; status por chip de cor; ações por ícone à direita com title.
- **Formulários:** só os campos que a equipe usa de verdade; pré-preencher o que o sistema sabe; explicação no (i) do rótulo; a equipe adiciona opção nova (categoria, canal, campanha) pela própria tela; "Duplicar" no lugar de campos múltiplos; checklist com check quando há tarefas.
- **Modal:** cabe em 1366x768 e em 375px, rola por dentro; rodapé com Cancelar antes da ação principal e ação destrutiva separada à esquerda.
- **Vazio:** estado vazio curto (ícone, uma frase, um botão). Lacuna aparece uma vez por card, nunca "sem dado" repetido em três lugares.
- **Automático no lugar de botão manual** quando dá (virada de ano, e-mail disparado ao registrar).

## 4. Texto que alguém lê

- Curto e direto, uma ideia por frase, sem repetir o título no parágrafo.
- Sigla nova sempre com (i); glossário para as siglas da casa.
- Mudou um termo: muda em todas as telas, PDFs, e-mails, exportações e integrações.
- Material de apoio é para ler com o sistema aberto ao lado: sucinto, com passo a passo e prints reais, fiel aos nomes exatos dos botões. Nada de documento de 180 páginas.
- Mensagem de WhatsApp: curta, sem tabela, sem travessão, didática para quem não é de tecnologia.
- PDF: contraste conferido (nunca texto claro em fundo claro).

## 4.1 Sem cara de IA

O sistema não pode parecer feito "no automático" por uma IA. Se um elemento só está ali porque é o padrão de interface gerada por IA, ele sai. (Inspirado nos "AI tells" do taste-skill, adaptado ao que a equipe pediu.)

- **Ícones:** nada de brilho/estrelinhas (✦ ✨ "Sparkle"), varinha mágica, robô, cérebro ou raio para representar a IA ou um resultado. Use o ícone do que a coisa É: fluxo/diagrama, alvo, check, documento, seta de transformação, ou o símbolo da própria marca. Biblioteca de ícones pronta (Phosphor ou a do projeto); não desenhar ícone à mão. Nada de emoji na interface.
- **Cor e efeito:** nada de degradê roxo/azul "de IA", brilho neon, sombra colorida brilhando em botão, texto em degradê no título, vidro fosco em tudo. Base neutra com um único acento (padrão: verde floresta suave, seção 2.0). Nada de verde-água, ciano, petróleo ou azul saturado como cor do sistema. Preto puro (#000) não: use #09090b.
- **Texto:** nada de verbo de propaganda vazio ("revolucione", "potencialize", "eleve", "transforme sua jornada", "sem esforço", "mágico", "next-gen", "o futuro de"). Diga o que faz, com verbo concreto ("desenha o processo", "marca onde trava"). Nada de "Powered by IA" ou selo "IA" decorativo: o benefício aparece no resultado.
- **Dado de exemplo com cara de real:** nomes e números verossímeis e brasileiros (nada de "Fulano", "John Doe", "Acme", 99,99%, 50%). Continua valendo avisar que é demonstração.
- **Layout de landing:** nada de etiqueta em CAIXA ALTA acima de toda seção, numeração decorativa ("01 / Recursos"), fileira de três cards iguais só com texto, pontinhos coloridos decorando listas, linhas de grade decorativas, selo de versão ("BETA", "v2.0") no topo. O "·" vale no máximo uma vez por linha.
- **Movimento com motivo:** animação só para contar uma história, chamar atenção para o certo ou responder a uma ação. Nada de pulsar/brilhar em loop em todo card. Respeitar "reduzir movimento".
- **Demonstração honesta:** prefira mostrar o produto de verdade (print real ou componente real em modo demonstração) a montar uma tela falsa genérica.

## 5. Erros que já aconteceram (não repita)

- Cards da mesma fileira com alturas diferentes, sobrando faixa branca embaixo dos menores. Corrigido uma vez e voltou depois de outro ajuste: confira a altura toda vez.
- Card com só um "·" e uma frase, o resto em branco.
- Funil curto ao lado de uma lista longa, meia coluna vazia.
- Lista de opções com "·" antes de cada nome, sobra da troca de travessão.
- "Indicador — descrição", "Pesquisa | complemento": travessão e barra vertical.
- "Plano 2026 ·R$ 0": separador sem espaço depois.
- Parágrafo de cinco linhas de metodologia aberto no meio da tela; seção "Como ler" com sete itens longos.
- Fileira de chips com todos os produtos repetindo o seletor da lateral ("o número de itens pode aumentar e ficar feio").
- Selos e botões no topo que ninguém usa (backup, configurações, "dados reais").
- Card que não reage ao clique.
- Card com só o número ("R$ 343K", "38%") e nada que se veja: faltou a barrinha, a minitendência ou a rosca.
- Ao tirar botões supérfluos, sumiram junto os que a pessoa usava (importar, exportar, imprimir). Tire só o que sobra.
- Fonte de 10 e 11px em rótulos e menus.
- Apelidos internos e nomes de planilha na tela, no lugar do termo de quem usa.
- Exemplo misturado com real, ou "Sem dado" deixando a tela vazia.
- Trilha "Início › Tela" em todas as telas, sempre apontando para o mesmo lugar.

## 6. Sistema novo: o kit inicial

1. Defina os tokens antes da primeira tela: cores (fundo, superfície, borda, texto primário/secundário/terciário, acento, verde/amarelo/vermelho/azul de estado), raio, sombra, espaçamento (4/8/12/16/20/24), a escala da seção 2.
2. Instale o ApexCharts (pela skill `apexcharts`) e crie um helper de gráfico com o tema do sistema (cores, fonte, tooltip em português, claro/escuro). Crie os componentes base: cabeçalho de página com (i) e comandos à direita, card com título + (i) + ação, card de número (rótulo 12px, número, apoio 12px e um visual: sparkline, barrinha ou mini rosca), barra de progresso com marca de hoje, chip de status, tabela com cabeçalho fixo, modal, estado vazio, faixa de "dados demonstrativos", dropdown de escopo e de período.
3. Crie o helper do (i) (`dica(texto, titulo)`) e o filtro que troca travessão de dado vindo de fora.
4. Escreva testes de contrato que travem o padrão: nenhum travessão em texto, nenhuma fonte abaixo de 12px, toda página com o mesmo cabeçalho, opções sem "·" inicial.

## 7. Sistema existente: o fluxo de ajuste

1. **Ache o contexto antes de mexer.** Pedido de reunião, print ou mensagem: identifique a tela, o bloco e o trecho de código exato. Transcrição se lê inteira; marque minuto e quem falou.
2. **Separe decidido de em aberto.** Decidido se faz. Em aberto se decide pelo caminho mais simples e reversível, se faz e se registra.
3. **Fotos "antes" antes de mudar**, com o mesmo roteiro que vai tirar as "depois", recortadas na área que mudou.
4. **Aplique no sistema inteiro.** "Você já entendeu o padrão, não precisa falar em todas as páginas."
5. **Teste e reteste:** o que mudou e o que depende dele; trave a decisão com um teste de contrato; diga como desfazer.
6. **Confira com os olhos** em 1440, 1366 e 375 px: alturas, buracos, texto cortado, (i) solto, travessão, fonte pequena.
7. **Entregue em PDF** item por item: o que foi falado (trecho, minuto, quem) · o que foi entendido · o que foi feito · foto antes x depois · o que ficou de fora e por quê.

## 8. Arquivos desta skill

- `references/decisoes.md`: cada decisão concreta com data e frase de origem, por tema (texto e (i), travessão, cards, gráficos, tipografia, cabeçalho, filtros, menu e usuário, formulários e listas, termos, dado de exemplo, clique, entregas, modo de trabalho). Consulte quando o ajuste tocar um desses temas.
- `references/checklist.md`: conferência antes de entregar tela ou documento.
- `scripts/varrer.py`: aponta travessão em texto, fonte abaixo de 12px, explicação longa fora do (i) e opção começando com "·". Uso: `python scripts/varrer.py <pasta-ou-arquivo> [...]`.
