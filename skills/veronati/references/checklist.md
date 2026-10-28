# Checklist VeroNati (antes de entregar)

Passe item por item. Se um falhar, corrija antes de dizer que está pronto.

## Tela
- [ ] Título da página com (i); nenhum subtítulo, parágrafo ou "como ler" aberto.
- [ ] Comandos na mesma linha do título, encostados à direita.
- [ ] Sem trilha de navegação decorativa.
- [ ] Barra de filtros igual às outras telas: tempo (predefinidos + personalizado), filtros por entidade (empresa, produto, tipo...), combináveis, chips de filtro ativo com "Limpar filtros", salvos na URL e aplicados a todos os cards, gráficos e tabelas.
- [ ] Todo card e todo item de gráfico clica e faz algo útil (filtra, abre detalhe); hover com detalhe; cursor, realce e foco por teclado.
- [ ] Tema inicia seguindo o sistema; Claro e Escuro à mão; escuro quase preto.
- [ ] Cards da mesma fileira com a mesma altura; nenhuma faixa branca embaixo.
- [ ] Nenhum card "vazio" (um número e muito branco); nenhum bloco curto ao lado de um longo deixando buraco.
- [ ] Todo número com um visual ao lado (sparkline, barrinha, rosca, seta de variação); gráfico onde havia texto descrevendo número.
- [ ] Gráficos em ApexCharts (skill `apexcharts`), com as cores do tema, rótulos de 12px, tooltip em português, sem título interno, preenchendo a altura do card.
- [ ] Legenda no canto direito, na linha do título do gráfico.
- [ ] Todo card de número clica e leva ao recorte certo (ou abre detalhe).
- [ ] Dado de exemplo com aviso; nenhum exemplo somado a real; nada hardcoded.
- [ ] "Sem dado" aparece no máximo uma vez por card, com o que resolve.

## Texto
- [ ] Nenhum "—", "–", " - " ou "|" como separador; "·" sempre com espaço dos dois lados.
- [ ] Nenhuma opção de lista começando com "·".
- [ ] Três números lado a lado separados por " / ".
- [ ] Termos da equipe (não nomes internos); siglas com (i).
- [ ] Termo alterado foi alterado em todas as telas, PDFs, e-mails, exportações e integrações.

## Tipografia
- [ ] Nada abaixo de 12px (rótulos, selos, menus, cabeçalhos de tabela, legendas).
- [ ] Corpo, linha de tabela, item de menu e caixa de aviso em 14px.
- [ ] Números em `tabular-nums`; moeda curta nos cards, cheia no detalhe.

## Formulário e modal
- [ ] Só os campos que a equipe usa; pré-preenchido o que o sistema sabe.
- [ ] Ajuda de campo no (i) do rótulo.
- [ ] A equipe consegue adicionar opção nova sem pedir ao desenvolvedor, quando a lista não é fixa por regra.
- [ ] Modal cabe e rola em 1366x768 e em 375px.

## Prova
- [ ] Fotos antes (tiradas ANTES de mudar) e depois, mesmo roteiro, recortadas.
- [ ] Conferido com os olhos em 1440, 1366 e 375 px, tema claro.
- [ ] Testes do que mudou e do que depende dele; teste de contrato travando a decisão.
- [ ] `python scripts/varrer.py` sem achados novos.
- [ ] Entrega diz o que ficou de fora e por quê.
- [ ] Cabe na tela sem rolagem (entrada e painéis) em 1280x720, 1366x768, 1440x900, 1536x864, 1920x1080, 2560x1440 e tablets; no celular (360x800, 375x667, 390x844) o principal aparece sem rolar; nunca rolagem horizontal.
- [ ] Sem cara de IA: nenhum ícone de estrelinhas/brilho, varinha, robô ou cérebro; sem degradê roxo, neon, texto em degradê ou emoji; sem verbo de propaganda vazio; sem etiqueta em caixa alta acima de toda seção; animação só com motivo.
