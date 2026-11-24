---
name: proposta-de-design
description: >-
  Use quando o pedido for design, redesign, rebranding ou uma nova linguagem
  visual de um app existente, de um app do zero, de uma marca ou de um site,
  e o resultado for uma proposta (PDF com telas, logos, paletas e decisões)
  antes de qualquer implementação ou PR. Também quando o usuário quiser
  uma direção visual, um guia de fundamentos ou um inventário de telas
  antes de desenhar o produto inteiro.
---

# Proposta de design

Você conduz a conversa, investiga o produto, desenha, audita e entrega. O usuário escolhe a direção, aprova as regras e telas e decide se haverá implementação. Converse no idioma do usuário; escreva rótulos, mensagens e demais textos da interface no idioma do projeto. Se o pedido for apenas uma opinião sobre uma tela, responda diretamente. Se for apenas um inventário, direção ou guia, encerre na entrega pedida.

## Como conduzir os portões

Leia [as regras gerais](references/regras.md) ao iniciar a proposta. Releia-as antes de desenhar e antes de cada autoauditoria. Mantenha no **projeto**, não nesta skill, um guia curto com inventário aprovado, fundamentos e escolhas do usuário.

**PARA** significa: mostre o material da etapa, faça uma pergunta objetiva sobre ele e encerre o turno. Não comece a etapa seguinte, nem em paralelo. Uma escolha inequívoca aprova aquela escolha; dúvida, silêncio ou pedido de alteração não aprovam nada. Se houver feedback, transforme-o em regra no guia do projeto, com o contexto em que vale; aplique-o e mostre a revisão no mesmo portão. Se o usuário dispensar expressamente uma etapa, registre qual e siga. Não dispense etapas por conta própria. Se uma regra puder servir a qualquer produto, proponha a redação separadamente; só altere `references/regras.md` com o acordo explícito do usuário para essa mudança compartilhada.

### 0 · Descoberta — PARA

Identifique o modo e o alcance do pedido. Faça perguntas curtas apenas sobre o que ainda não sabe.

- **A · App existente.** Leia o código e, quando acessível, confira o produto. Para cada rota, registre caminho de navegação, tarefa, estados (vazio, carregado, aberto, erro e transições de fluxos com várias etapas), campos reais de formulários, fichas e listas, inclusive obrigatoriedade. Separe funções e dados a preservar das mudanças visuais a propor. Pergunte o que incomoda hoje, quais referências a pessoa ama ou odeia e quais restrições já foram decididas. Se algo não puder ser conferido, peça a evidência; não complete por suposição.
- **B · App do zero.** Pergunte para quem é, o que faz, o que não pode faltar, concorrentes e referências desejadas ou rejeitadas. Proponha um mapa de telas, fluxos, estados e campos por tela. Identifique-o como proposta, não como produto já existente. O mapa aprovado será o inventário.
- **C · Marca ou site.** Não invente telas de app. Inventarie as peças de marca, páginas, componentes e estados necessários; se ainda não existirem, proponha um mapa. Para marca sem site, trabalhe com aplicações concretas da identidade, não com páginas fictícias.

Mostre o inventário ou mapa, o que fica de fora e as lacunas. **PARA:** “Este mapa cobre o que devemos desenhar? O que falta ou deve sair?”

### 1 · Direções em pequena escala — PARA

Escolha uma única tela, página ou aplicação-chave do inventário. Mostre **3 ou 4 direções** aplicadas à mesma tarefa, com os mesmos dados, cada uma com paleta e tipografia visíveis. Explique em uma frase o que cada direção favorece. Não desenhe o produto inteiro. **PARA:** “Qual direção seguimos? Quer combinar partes ou ajustar alguma antes de escolher?” Se houver mistura, mostre a síntese para aprovação.

### 2 · Regras do projeto — PARA

Converta a direção escolhida em um guia curto e aplicável: densidade, composição mobile, listas e tabelas, detalhes, formulários, dashboards, bordas, paleta, tipografia e componentes base. Parta das regras gerais; registre uma exceção com seu alcance apenas se o usuário a pedir. Defina tokens por função e os componentes pertinentes: botão de ícone, segmentado, linha de configuração, popover, campo de composição de mensagem, badge, cabeçalho mobile, card e tabela. Mostre como se combinam em vez de redesenhar o mesmo controle por tela. **PARA:** “Aprova este guia para montar as próximas peças?”

### 3 · Marca, quando fizer parte do escopo — PARA

Se não houver pedido de marca nova, diga que a identidade existente será preservada (ou que marca está fora do escopo) e que esta etapa não se aplica. Caso contrário, mostre símbolo e wordmark em claro, escuro e sobre as cores do tema, com racional curto, ícone de app e favicons em tamanho real quando cabíveis. **PARA:** “Qual direção de marca aprova ou qual variação quer ver?”

### 4 · Telas-chave — PARA

Escolha **4 a 6** telas ou páginas que exercitem tarefas distintas do inventário; para marca, use as aplicações aprovadas. Se o escopo tiver menos peças, mostre as existentes, sem inventar outras para atingir a contagem. Desenhe-as completas em desktop e mobile com os componentes do guia. Faça mocks realistas e determinísticos; sempre que possível, use preview sem login, banco ou serviço real. Para capturas, use 1440×900 e 390×844, em claro e escuro se o produto tiver temas. Confira o contraste de texto, texto grande, ícones e foco sobre seus fundos reais.

Mostre a tarefa, os dados e o resultado em ambos os tamanhos. **PARA:** “O que precisa mudar nestas telas antes de aplicar o padrão às demais?” Após cada ajuste, apresente as telas corrigidas e espere aprovação do conjunto. Não trate o fim de uma rodada de comentários como aprovação.

### 5 · Cobertura — PARA

Só agora desenhe o restante do inventário, incluindo os estados dos fluxos. Em cada página de tela, indique o caminho real de navegação (por exemplo, `Espaços › Pasta`); num projeto novo, use o caminho do mapa aprovado. Confronte inventário e entregas, rode a autoauditoria de `references/regras.md`, corrija as falhas e confira novamente **antes de mostrar**. Apresente as peças e a cobertura por caminho e estado. **PARA:** “A cobertura está completa e aprovada para fechar o documento?”

### 6 · Documento final — PARA

Reúna apenas a proposta escolhida: fundamentos, marca quando aplicável, componentes e telas contextualizadas. Entregue um documento que faça sentido a quem não participou da conversa: sem “v1/v2”, carimbos de “decidido”, opções descartadas ou relato de iterações. Preserve versões de trabalho internamente; identifique entregas intermediárias como rascunhos.

Use o gerador do usuário se existir; se não, use as ferramentas disponíveis para entregar PDF ou documento em HTML com capturas e assets. Não transforme a página inteira em uma imagem quando o texto precisar permanecer selecionável. Refaça a autoauditoria no **artefato final renderizado**: a exportação pode introduzir cortes ausentes no preview. Se faltar um meio de inspeção, peça uma renderização ou capture-a com o usuário; não declare auditado o que não viu. Entregue os arquivos e indique o formato. **PARA:** “Aprova esta proposta final?” Um ajuste reabre a parte afetada e exige nova conferência. A entrega não autoriza implementação.

### 7 · Plano de implementação — somente após aprovação da proposta

Se houver código, comece pelo levantamento de duplicações: quais componentes e tokens já existem, onde divergem e quais telas os consomem. Planeje a refatoração DRY em fases de PR: primeiro consolidar tokens e componentes base; depois migrar as telas por fluxo, sem componentes locais duplicados. Sem código, planeje a mesma sequência do zero. Em cada fase indique o resultado visível e como verificá-lo contra a proposta aprovada. Entregue **o plano**, não as mudanças. Implementar, fazer push, abrir PR, fazer merge ou publicar exige OK explícito do usuário para a ação correspondente.
