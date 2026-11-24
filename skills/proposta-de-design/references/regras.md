# Regras gerais para propostas de design

Aplique cada regra onde existir a tarefa correspondente. Um produto sem quadro não precisa de um Kanban; um produto com quadro precisa de uma solução própria para ele. Use o inventário aprovado para determinar o que desenhar.

1. **Mobile é um layout próprio.** Reordene conteúdo e ações, não encolha o desktop. Use margens laterais simétricas de segurança de 16 px; nada cortado nem com rolagem horizontal acidental. Mantenha o badge dentro do alvo de toque do ícone. Restrinja o cabeçalho a menu, marca, busca e sino, conforme as funções existentes; o restante vai no menu. Tema não vai no cabeçalho mobile. Evite caixa dentro de caixa.

2. **Uma borda por contorno.** Use um único limite para agrupar conteúdo; não some borda do card, moldura da seção e outro contorno com o mesmo papel. Marque citação com barra vertical reta `|`. Não curve a barra nem acrescente curvas decorativas sem função.

3. **Isole a cor legada.** A cor do tema antigo só aparece dentro dele, na sua amostra de paleta ou num seletor que o identifique explicitamente como legado. Nas demais telas, inspecione pixels ou faça varredura visual do render: verifique também ícones, foco, gráficos e imagens. Remova as ocorrências indevidas no componente ou asset de origem e renderize de novo.

4. **Desktop: alinhe pelo significado dos dados.** Para comparar registros, use tabela ou lista densa, linhas de 40–48 px, divisores e colunas com significado real. Revele ações no hover e também no foco; use painel lateral para o detalhe. Limite a largura de leitura. Uma lista curta não tabular pode usar grade de cards compactos. Não estique um card de uma linha de ponta a ponta com rótulo numa extremidade e valor perdido na outra.

5. **Detalhes: aproxime rótulo e valor.** Organize a ficha em seções e, no desktop, em grade de duas ou três colunas com o rótulo **acima** do valor. Reserve o painel lateral para ações e metadados. No celular, reordene as seções; não volte ao par rótulo ↔ valor separado por um vão.

6. **Formulários: preserve os campos antes de reorganizá-los.** Confira nome, obrigatoriedade e estados de cada campo contra o produto ou mapa aprovado. Se uma descrição é obrigatória no produto, mostre-a também no mock. Agrupe por seção; use duas colunas quando couber e ponha prévia ou resumo ao lado. No mobile, fixe o envio no rodapé e reserve espaço para ele não encobrir o último campo ou seu erro.

7. **Dashboards devem permitir interpretação.** Mostre cada KPI com período e variação em relação ao período anterior. Desenhe gráficos com séries, escala e unidades coerentes com os dados do cenário, não imagens decorativas. Complete com listas densas de pendências ou lançamentos que expliquem os indicadores. Quatro números soltos não constituem uma visão geral.

8. **Kanban muda de organização no celular.** No desktop, use colunas por status e cards com os dados que sustentam a decisão, como responsável, prazo e etiqueta. No celular, cada status é uma aba com contador e lista rolável própria; não esconda colunas fora da tela num quadro horizontal.

9. **Sessão ao vivo em segundo plano.** No mobile, mantenha uma faixa fina de uma linha **no topo**, com duração, expandir, mutar e desligar. Tocar na faixa expande; os controles executam a própria ação. Não cubra o campo de escrever com uma barra inferior. No desktop, preserve o padrão do produto, se já definido.

10. **Mocks reproduzem o domínio, não inventam o produto.** Busque no código ou mapa aprovado nomes, campos, abas, estados, ações e navegação. Use registros fictícios plausíveis, estáveis entre telas. Identifique como futuro qualquer recurso ainda não disponível. Em cada página de tela do documento mostre o caminho pelo qual a pessoa realmente chega ali, não um título editorial inventado.

11. **Ações ocupam só o espaço necessário.** Prefira um botão compacto, como `+` com nome acessível e tooltip “Novo projeto”, a um botão largo de texto genérico. Preserve uma área de toque adequada. Fora de Configurações, quando houver troca de tema, use botão com dropdown; no mobile, acesse-o pelo menu, não pelo cabeçalho. Se o login já destaca o símbolo em tamanho grande, mantenha só o wordmark na assinatura menor.

12. **Densidade em três níveis.** Primeiro, revele a explicação no espaço livre da mesma linha ao passar o mouse ou focar: a altura não muda. No toque, ofereça acesso equivalente. Segundo, permita no máximo **uma linha adicional** se um aviso curto justificar o deslocamento. Terceiro, se houver um formulário, uma prévia ou mais conteúdo, use popover ancorado ao acionador, sem empurrar a lista. Compare a posição do próximo item antes e depois.

## Autoauditoria obrigatória

Faça duas passagens: **antes de apresentar a cobertura** e **antes de entregar o documento final**. Confronte cada caminho e estado do inventário com sua representação renderizada. Inspecione o desktop e amplie cada captura mobile de cerca de 390 px até conseguir ler os campos e os avisos; miniaturas não bastam. No documento exportado, abra as páginas reais, não apenas o arquivo-fonte.

- [ ] Não há overflow, cortes de conteúdo nem controles encobertos. As margens mobile têm 16 px e são simétricas; badges permanecem dentro do alvo de toque.
- [ ] Não há borda dupla, moldura grossa ou caixa redundante. Nenhuma ficha ou linha de card separa rótulo e valor por um vazio enorme.
- [ ] Campos, inclusive obrigatórios, abas, estados e ações batem com o inventário. Cada tela indica o caminho de navegação correto. Recursos futuros estão identificados.
- [ ] Cada tela resolve a própria tarefa, em vez de repetir o molde título + filtro + lista. Dados e relações são plausíveis: não há “Item 1”, “Lorem ipsum” ou gráficos decorativos.
- [ ] Não há cor proibida fora do legado. Confira os pares reais sobre o fundo composto, em cada tema: para WCAG AA, texto normal ≥ 4,5:1; texto grande, ícones informativos e foco ≥ 3:1. Não conclua pelo aspecto isolado da amostra de cor.
- [ ] As ações funcionam no arranjo previsto para toque e teclado; detalhes, formulários, quadros e chamadas respeitam as regras aplicáveis. No documento, verifique também legibilidade e seleção do texto que deve continuar selecionável.

Para cada falha, anote caminho, estado, viewport e elemento no guia de trabalho. Corrija a causa, gere novamente a peça afetada e reinspecione-a. Se a causa estiver num componente compartilhado, confira as outras telas que o usam. Só apresente a cobertura ou o documento depois dessas correções; uma verificação impossível deve ser resolvida, não marcada como concluída.
