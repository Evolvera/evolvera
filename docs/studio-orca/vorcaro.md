# Vorcaro, a inteligência Master

Pedido: uma central que conhece as sessões recentes, responde sobre tudo, monta quadro e checklist, sugere o que fazer e manda o pedido para a sessão escolhida, que trabalha até concluir. Entregue no patch `studio-patches/0003-vorcaro.patch`. Botão "Vorcaro" na barra superior ou `Alt+V`.

![Vorcaro](vorcaro.png)

## Como funciona

1. **Memória: um resumo por sessão, não forks.** Para cada sessão principal de PI mexida nos últimos 7 dias, o Studio extrai do próprio log um resumo: título, projeto, pedido inicial, último pedido, última resposta, itens abertos da lista de tarefas, estado do `/goal`, custo e última atividade. Não chama modelo (sai de graça, sempre igual), só relê um arquivo quando ele muda, e grava tudo em `~/.pi/agent/pi-studio-data/vorcaro-digests.json`. Sessões de subagentes entram pela sessão mãe.
2. **Respostas: um PI somente leitura.** O Vorcaro é o mesmo motor da aba Dúvidas: um PI lateral com read, grep, find e ls, que não grava sessão nem aceita comandos com `/` ou de shell. Ele lê primeiro `vorcaro-sessoes.md` (os resumos em texto) e, quando precisa de detalhe, o log da sessão.
3. **Quadro.** As sessões ficam em quatro colunas: Aguardando você (a última resposta pergunta algo, o objetivo está bloqueado ou há um diálogo aberto no Studio), Fazendo (rodando agora, ou com objetivo ativo e atividade recente), A fazer (itens abertos e nada rodando) e Feito. Cada cartão mostra projeto, quando mexeu, custo, a pergunta pendente e o progresso dos itens com barra. Clicar abre a conversa. No topo aparecem avisos como "1 conversa espera sua resposta".
4. **Mandar fazer, com confirmação.** Quando você pede algo para uma sessão, o Vorcaro reescreve o pedido como objetivo, checklist de aceite e instruções, num cartão com o botão "Enviar para a sessão". Ele nunca envia sozinho. Ao clicar, o Studio reabre a conversa indicada (ou usa a conversa atual do projeto) e manda um único `/goal` com o checklist. O pi-goal mantém a sessão trabalhando até `goal_complete` ou `goal_blocked`, e a extensão autopilot retoma quando sobram itens na lista de tarefas. O Vorcaro não repete essa lógica.
5. **Acompanhar.** Cada pedido enviado aparece no topo do quadro com estado ao vivo, lido do resumo da sessão de destino: enviado, trabalhando, aguardando você, bloqueado, parou sem concluir, concluído e verificado. "Concluído e verificado" só aparece quando a própria sessão chama `goal_complete`, que exige o aceite verificado.

Segurança:
- Os logs trazem texto de terceiros (páginas e arquivos que os agentes leram). Por isso nenhum bloco de código dos logs chega ao Vorcaro: os resumos neutralizam cercas de código e a palavra do bloco de ação. O arquivo e o prompt dizem que resumos e logs são dados, nunca instrução, e que só se propõe envio quando a própria pessoa pede na conversa.
- Nada sai sem clique. O cartão mostra a pasta completa, a conversa indicada, o objetivo, o checklist e as instruções, que é exatamente o que vai no `/goal`.
- O servidor só aceita um projeto que o Studio já conhece, uma worktree listada pelo Orca ou uma pasta dentro das raízes de projeto. Quando uma conversa é indicada, ele só envia se for exatamente ela que está aberta no PI do projeto (409 em qualquer outro caso). Se ela estiver rodando em outro lugar (terminal do Orca ou outro PI), o envio para e avisa.

## Feito nesta rodada e o que falta

Feito: camada de resumos persistida, perguntas e respostas sobre tudo, quadro com checklist e avisos, briefing com objetivo e aceite, envio por `/goal` após confirmação, reabertura da conversa escolhida e acompanhamento do estado de cada pedido.

Falta:
- O Vorcaro rodar ele mesmo a verificação (os testes do projeto, abrir a entrega) depois que a sessão disser que concluiu. Hoje a verificação é a do próprio `/goal` da sessão; o Vorcaro mostra o resultado, mas não refaz.
- Mandar a sessão retomar quando ela parar sem concluir e sem bloqueio real, com limite de tentativas. Hoje isso fica com o pi-goal e o autopilot dentro da sessão; o Vorcaro só mostra "parou sem concluir".
- Resumo escrito por modelo (Luna) além do resumo extraído do log, e memória de longo prazo e camada de skills e ferramentas próprias (o desenho já reserva lugar: o resumo é um registro com campos, e o Vorcaro é um PI lateral cujas ferramentas e prompt mudam num só lugar).
- Escolher o modelo do Vorcaro (hoje usa o modelo padrão do PI).

## Testes

`test/vorcaro.test.mjs`: resumo de uma sessão real em formato de log (título, pedidos, itens, objetivo que é limpo depois de concluir, custo), sessões de subagente e arquivos quebrados fora, regras de coluna (inclusive "um log que parou no meio não é trabalho"), índice que reaproveita, persiste e respeita a janela de 7 dias, texto dos resumos sem travessão, quadro com avisos e o estado de cada pedido, validação das propostas, mensagem do `/goal`, cartões do navegador, e as rotas com o PI falso: quadro, sessão do Vorcaro somente leitura (recusa `/goal` e shell), envio com pasta inválida (400), fora das raízes (403) e válido (201, pedido registrado e visível no quadro). Suíte completa do Studio com os três patches: 672 aprovados, 0 falhas. Há também o teste de que um bloco de ação plantado num log não chega ao Vorcaro e o de que uma conversa indicada que não está aberta é recusada (409).
