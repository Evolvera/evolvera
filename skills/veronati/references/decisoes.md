# Decisões VeroNati

Cada decisão de design e de texto tomada por Natiam e Verônica, por tema, com a frase de origem quando houver. São regras gerais: valem para qualquer sistema. Quando um ajuste novo tocar um destes temas, siga a decisão e aplique no sistema inteiro.

Fontes: **V** = Verônica (revisão tela a tela e mensagens de ajuste); **N** = Natiam (pedidos, correções e prints).

## Índice
1. Texto, explicação e o (i)
2. Travessão e separadores
3. Cards, alturas e espaço vazio
4. Gráficos e números
5. Tipografia
6. Cabeçalho, botões e barra do topo
7. Filtros: escopo e período
8. Menu lateral e usuário
9. Formulários e listas
10. Nomes e termos
11. Dado de exemplo e lacuna
12. Clique e navegação
13. Entregas: PDF, material de apoio, mensagem
14. Modo de trabalho
15. Responsividade e caber na tela
16. Sem cara de IA
17. Paleta

## 1. Texto, explicação e o (i)
- Toda explicação vai para o (i) ao lado do título a que pertence: subtítulo de página, de card, de seção, de modal, ajuda de campo, nota de rodapé, legenda de cores, "como ler". (V: "deixa tudo no izinho do lado. As primeiras vezes eles podem ter dúvida, mas depois vai ficar só sendo lixo visual"; "pode tirar essa explicação"; "corta isso, corta isso, corta isso".)
- O que é só data ou contagem ("11 widgets ativos · recorte: outubro de 2026") some em vez de virar dica: o botão do período já diz a data. (V.)
- O padrão vale para o sistema inteiro sem precisar apontar tela por tela. (V: "você já entendeu o padrão, não precisa falar em todas as páginas". N: "aplicar o padrão para todo o sistema, retirar os textos que enchem linguiça, as explicações virarem o (i)".)
- Fica à vista: estado (erro em vermelho, aviso em amarelo), texto com botão ou link dentro, validação ao vivo de campo.
- "Deixa a interface mais limpa possível. Não é das cavernas, é um design limpo." (V.)
- Saem da tela: notinhas cinzas embaixo de cada item, códigos internos, níveis de criticidade e notas de algoritmo que só o sistema entende. (V.)
- Uma linha de explicação geral no topo da tela sai inteira. (V.)

## 2. Travessão e separadores
- "Eliminar todos os travessões do sistema, sem '-'." (N.) Vale para tela, PDF, e-mail, exportação e mensagem; "não use '-'" também em mensagens.
- Separador entre partes curtas: "·" com espaço dos dois lados. "Plano 2026 · R$ 575K", nunca "Plano 2026 ·R$ 575K".
- Três números lado a lado são três dados: separe por barra. "R$ 12.185,69 investidos / 101 leads / R$ 120,65 cada". ("Não é uma frase, são 3 dados: vamos botar uma barra.")
- Opção de lista nunca começa com "·" (aconteceu numa lista inteira, sobra da troca do travessão). (N.)
- "|" como separador de texto também sai: vira título + apoio. (N.)
- Dado que vem do banco ou da digitação passa por um filtro que troca travessão antes de aparecer.

## 3. Cards, alturas e espaço vazio
- "Esses dois cards estão menores que o primeiro, ideal sempre ter a mesma altura pra não ficar esses espaços em branco." (N.)
- "Aumentar e/ou centralizar as informações, card muito vazio." (V.)
- Bloco ao lado de outro maior não deixa buraco: um funil curto ao lado de uma lista longa deixava meia coluna branca. O menor ganha conteúdo ou a disposição muda (empilhar, ocupar a linha inteira). (N.)
- Valores do card podem ficar centralizados. (V.)
- Bordas arredondadas. (V.)
- Estados de um mesmo valor (ex.: planejado, contratado, pago, falta distribuir) viram cards lado a lado no topo, cada um com (i). (V.)
- Lista longa vira card com os 10 últimos e um pop-up grande que rola e filtra. (V: "um cardzinho com limite de uns 10 últimos; se a pessoa quiser ver detalhado abre um pop-up grande e ela consegue rolar tudo e filtrar também".)
- Lançamentos do ano: 12 cards por mês (total, quantidade, barrinha por estado); clique abre o mês. (V.)
- Os cards de número ficam acima das barras de filtro secundárias. (V.)
- Banner de cabeçalho de item: marca no centro, título e dados cadastrais embaixo, sem valores. (V.)

## 4. Gráficos e números
- Mais gráfico, menos texto: barra do plano com marca de "hoje", mini funil, barras por categoria, progresso "2/5". (N.)
- Sempre que possível, número acompanhado de visual (gráfico, barrinha, tendência), não só o número. Gráficos com ApexCharts, usando a skill `apexcharts`. (N.)
- Card de total mostra "R$ 4,7M / R$ 8,9M" com barrinha de % embaixo. (V.)
- Indicadores que a pessoa acompanha ficam juntos num card (ex.: CPL, CAC e ROI).
- Legenda no canto direito, na mesma linha do título do gráfico. (V: "no cantinho mesmo, é bom que fica até alinhado".)
- Título de gráfico que é jargão interno sai. (V.)
- Estimativa extrema não vira piada na tela: acima de um teto aparece "> 50x" e o valor exato fica no title.
- Números em `tabular-nums`; moeda curta nos cards (R$ 551K), cheia nas tabelas e no detalhe (R$ 551.080,59).

## 5. Tipografia
- "As fontes no geral estão com tamanho pequeno." (V.) Escala combinada:
  - 12px: etiqueta/selo, rótulo de card em caixa alta, seção do menu, cabeçalho de tabela, texto auxiliar (linha embaixo do número, eixos, legendas, rodapé);
  - 13px: título de seção, comparação com o período anterior;
  - 14px: caixa de aviso, corpo explicativo, linha de tabela, item do menu lateral.
- Nada abaixo de 12px. Caixa alta pede letter-spacing leve. (V: "rótulos de 10px estão bem pequenos; trabalhar com pelo menos 12px, ainda mais em caixa alta"; "para corpo, tabelas e menu, 14px funciona melhor em sistemas densos".)
- Tema claro era o padrão. (N: "vou usar em modo branco".) 16/10/2026 (Mapeia): "o Mapeia inicia no modo sistema, não no claro". Padrão agora segue o sistema (Automático), com Claro e Escuro à mão; escuro quase preto de verdade ("o modo escuro ser escuro mesmo"). (N.)

## 6. Cabeçalho, botões e barra do topo
- Regra única: título à esquerda, botões na mesma linha, encostados à direita. (V: "tem que estar na mesma linha, na direita; verifica isso em todas as páginas".)
- Botões espalhados embaixo do título sobem para a linha do título. (V: "juntar todos esses botões e jogar para o lado, alinhado".)
- Ao tirar botões supérfluos, os que a pessoa usa ficam (importar, exportar, imprimir, lançar). Tira o que sobra, não o útil. (V.)
- Sai da barra do topo o que não serve no dia a dia: selos internos, exportar/importar backup, configurações sem uso. (N.)
- Sai a trilha "Início › Tela" quando ela não reflete o caminho real. (N.)

## 7. Filtros: escopo e período
- Período igual em todo o sistema, começando em "semana atual". Até 16/10/2026 eram só quatro opções (semana atual, mês atual, ano atual, personalizado). (V e N.)
- 16/10/2026 (Mapeia): "ter filtros por tempo, pré-definido e personalizado, além de filtro por empresa... bastante filtros". Agora: predefinidos (hoje, últimos 7 dias, semana atual, mês atual, últimos 30 dias, trimestre, ano atual, ano anterior) + personalizado, mais filtros por entidade (empresa, produto, cliente, tipo, status...), combináveis, com chips de filtro ATIVO removíveis e "Limpar filtros", salvos na URL e valendo para todos os cards, gráficos e tabelas da tela. (N.)
- Rótulos curtos: "Outubro 2026", "2026", "Semana atual · 12/10 a 16/10". Sai "mês corrente". (V.)
- Escopo (qual item/unidade): dropdown ao lado do período, com todos os itens; não um botão "Trocar". (N: "esse botão de trocar não faz sentido, retire, deve ser um dropdown do lado do escopo".)
- Todos os itens também na lateral, com "Todos" levando à versão geral da tela aberta. (N.)
- Sem fileira de chips repetindo o seletor (todas as opções em chips). (V: "o número pode aumentar e ficar feio; na aba lateral já tem o filtro".) Chips só para mostrar os filtros ATIVOS, removíveis, isso pode.
- Botão que só repete o que um clique já faz sai. (V: "não precisa ter esse botão, é só clicar no lado".)

## 8. Menu lateral e usuário
- Grupos do menu abrem e fecham pela seta, como num ERP; abre sozinho o grupo da tela atual. (V.)
- Canto do usuário: foto, nome e papel maiores; "Sair" é um ícone pequeno e discreto no canto. (V.)
- Perfil editável: nome, sobrenome, e-mail, telefone e foto. (N.)
- Login é a porta de fora: nada do sistema aparece antes dele, e dentro não existe aba de login. (N: "o login não tem que ser interno, tem que ser externo".) Sessão não expira à toa ("não têm que fazer oito logins por dia").
- Papel e cargo não duplicam: fica um campo só. (V.)

## 9. Formulários e listas
- Só os campos que a equipe usa. ("Quanto mais campo a gente coloca, no final não dá tempo; é mais fácil executar a tarefa do que preencher.")
- Registro de tarefa como "uma planilha de poucas colunas para analisar o follow": agrupador, atividade, item, categoria, dono, prazo, origem, motivo de pausa, desdobramentos, anexo. Campo que ninguém preenche sai. (N.)
- Pré-preencher o que o sistema sabe (dono = quem está operando), sem texto explicando isso. (V.)
- Lista de atividades com check dentro do item ("eu gosto de dar um check nas coisas").
- A equipe adiciona opção nova (categoria, canal, agrupador) sozinha, sem pedir ao desenvolvedor.
- "Duplicar" no lugar de vários donos ou campos múltiplos.
- Lista: cabeçalho fixo ao rolar ("ele some; deixa ele fixo ali").
- Campo de pessoas sugere a equipe enquanto se digita. (V.)
- Modelo de importação em .xlsx e .csv, os dois. (V.)
- Ação automática no lugar de botão manual quando dá (virada do ano automática, e-mail disparado ao registrar). (V e N.)

## 10. Nomes e termos
- Use o termo que a equipe fala, não o nome interno (ex.: "Standby" no lugar de "Bloqueado"; "Data limite" no lugar de um apelido; "Atividade" no lugar de "Título").
- Nome que faz alguém perguntar "o que é isso?" se troca na hora. (N: "nome tá estranho, MUDE AGORA".)
- Sigla nova sempre com (i). Glossário à mão para as siglas do domínio.
- Mudou um termo: muda em todas as telas, PDFs, e-mails, exportações e integrações.

## 11. Dado de exemplo e lacuna
- "Colocar dados demonstrativos no que não tem, sob aviso que é demonstrativo, em tudo que não tem dados." (N.) Faixa no topo da tela e etiqueta "dados demonstrativos" no card.
- Exemplo e real nunca se somam; quando chega o real, o exemplo some sozinho.
- O aviso diz o que resolve em uma linha (ex.: "enviar a exportação de leads, um arquivo por mês").
- Nada hardcoded: o número vem do banco, de planilha importada, de API ou de LLM. (N.)

## 12. Clique e navegação
- "Quando eu clico em algum desses itens, não redireciona para a página com o card selecionado, nem abre nenhum pop-up." (V.) Todo card de número leva à tela filtrada naquele recorte ou abre o detalhe.
- Tela de detalhe com "Todos" selecionado mostra "Selecione um item para ver o detalhe", em vez de pular para outra tela. (V.)
- Arrastar ou trocar de visão não pode jogar a página para o topo nem piscar. (N.)
- 16/10/2026 (Mapeia): "se tiver cards, serem clicáveis / interativos". Todo card clica e faz algo útil (filtra a tela, abre o detalhe ou a tela filtrada); itens de gráfico (barra, fatia, ponto) clicam e aplicam o filtro daquele item; hover mostra o detalhe; clicável tem cursor, realce e foco por teclado. (N.)

## 13. Entregas: PDF, material de apoio, mensagem
- Ajuste se entrega em PDF, item por item: o que foi pedido/falado (trecho, minuto, quem), o que foi entendido, o que foi feito, foto antes x foto depois. (N.)
- Material de apoio para apresentar: curto, para ler com o sistema aberto ao lado, com passo a passo e prints. ("182 páginas, como vou ler isso?") (N.)
- Passo a passo fiel ao que aparece na tela real (prints reais, nomes exatos dos botões). (N.)
- PDF sem contraste errado (texto claro em fundo claro). (N.)
- Entrega como arquivo local (PDF/HTML) ou no chat. (N.)
- Mensagem de WhatsApp: curta, sem tabela, sem travessão, didática para quem não é de tecnologia. (N.)

## 14. Modo de trabalho
- Antes de mudar: achar a tela, o bloco e o código exatos do pedido. (N: "sempre é importante ver o contexto, alinhar com o sistema, identificar onde está a página".)
- Testar e retestar: o que mudou e o que depende dele; gestão de risco e como desfazer. (N.)
- Autônomo: decidir e fazer; o que ficou em aberto se decide pelo caminho simples e reversível e se registra. (N.)
- Fotos reais do sistema como prova. (N: "quero resultados, todos em prints reais do sistema".)

## 15. Responsividade e caber na tela
- 16/10/2026 (Mapeia): "lembra da responsividade de telas, notebook, celular, pc, tablet... tem diferentes tipos de notebook, pc, celular, tenta se adaptar, para que não aconteça rolagem, quero que veja a tela toda no monitor." Tela de entrada e painéis cabem inteiros sem rolagem em notebooks e monitores de vários tamanhos e em tablets; no celular o principal aparece sem rolar. (N.)

## 16. Sem cara de IA
- 16/10/2026 (Mapeia, tela de entrada): o ícone de estrelinhas no "TO BE", no centro do antes e depois e no cabeçalho do diagrama pronto "é muito cara de IA, altere". Trocado por ícones de processo (fluxo, alvo, seta de transformação) e pelo símbolo da marca. (N.)
- 16/10/2026: "coloque isso na skill VeroNati, esses padrões de IA, observe como a taste skill é também relativo a isso." Seção 4.1 criada a partir dos "AI tells" do taste-skill, adaptada. (N.)


## 17. Paleta
- 27/10/2026 (AVA conectado): "está puxando muito pra um verde, assim, um azul, um neon, um azul ciano. Tá muito estranho esse verde. O branco está bom, mas o preto não está preto. Eu preciso de uma paleta de cor boa." Paleta padrão trocada para grafite + cobalto (seção 2.0): base zinco neutra, escuro #09090b, botão principal monocromático, um único acento azul cobalto, estado só como estado, cartão MCP com fundo transparente. Indicada a taste-skill como referência de design. (N.)
- 27/10/2026 (AVA conectado, depois do cobalto): "algumas cores ficaram mortas... esse azul, esse vermelho muito forte, essas letras não precisam ser todas pretas... aquele contraste do branco com aquele verde estava legal... os gráficos ficaram muito fortes, nada agradável ao olhar humano. Veja algumas skills de design e atualize a skill VeroNati." Paleta trocada para verde floresta suave (acento #1f6f5c / sálvia #7cc4a0), texto grafite, gráficos em verde, coral e cinza suaves, Plus Jakarta Sans, sombras difusas e movimento sutil com curva natural (seção 2.0). Fontes consultadas: taste-skill, soft-skill e a base de paletas da ui-ux-pro-max (genérica, descartada). (N.)
