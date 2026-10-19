# Arte de entrada — Acid Shellscape

A entrada combina uma paisagem ampliada de pôr do sol, uma revelação animada em
camadas e um seletor de perfis inspirado em telas de videogame. Antes, a composição
era limitada a 12 linhas e dividia espaço com duas marcas; agora a paisagem ocupa
a largura disponível e somente a marca Evolvera pode aparecer dentro dela.

## Composição e identidade

- Céu em faixas discretas de roxo, lilás e coral, sol com halo pontilhado, três
  planos de montanhas e reflexo na água. Sem blur ou gradiente suave.
- Campos de cor usam espaços com fundo ANSI; meios-blocos conservam a proporção
  1:2 da célula de terminal. Texturas são estáveis por coordenada, sem RNG por quadro.
- A marca Evolvera é um marco da paisagem, com máscara de 40×34 pixels derivada do
  SVG oficial e duas faces azuis. Não é uma letra “A” desenhada com uma fonte.
- **Não há logo nem texto PI na arte personalizada.** O pequeno cabeçalho nativo
  do SDK continua pertencendo ao próprio PI e não é substituído por esta integração.
- A marca Evolvera aparece somente quando o **nome exibido** da conta é uma string
  cujo `trim().toLowerCase()` seja `evolvera`. Não há fallback para ID, provedor,
  usuário do sistema ou nomes como `Evolvera Labs`.
- Outros usuários recebem a mesma paisagem, sem marca. No seletor, a conta
  destacada determina a marca; “Create new account” nunca recebe essa marca.

A referência é o **Acid Shellscape** privado de Kevin, commit
`9075be47288d4b85a9eadb59234cbc769a02e130`: README, tokens e imagem do tema poente.
A implementação é uma tradução nativa para células de terminal, não um Canvas
embutido. A fonte privada permanece © Kevin; seu código completo e capturas não
são vendorizados nem recebem uma licença nova por esta tradução.
A geometria da marca vem de <https://evolvera.com.br/logo.svg>.
Nenhuma imagem, fonte ou recurso remoto é baixado durante a execução.

## Renderização e tamanho

`scripts/ui/terminal-art.mjs` é a autoridade da composição, com geometria da marca
em `scripts/ui/terminal-art-masks.mjs`:

```js
renderTerminalArt({ width = 80, height = 24, label = '', color = true, progress = 1 } = {}) // string[]
isEvolveraLabel(label) // boolean
```

O renderer é puro: sem relógio, timers, ambiente, I/O ou aleatoriedade externa.
`progress` varia de 0 a 1; omitir significa a composição final. Todos os quadros
mantêm o mesmo orçamento de linhas/colunas. Dimensões finitas são arredondadas para
baixo e limitadas a **240 colunas × 40 linhas**; inválidas ou não positivas não
alocam uma cena. Superfícies pequenas conservam uma paisagem proporcional e omitem
a marca quando ela não seria legível. ANSI é apenas SGR, com reset ao fim de cada
linha; `color: false` conserva uma cena monocromática sem escapes.

O seletor tem um orçamento único para cena, moldura, ajuda e até cinco opções
visíveis, com rolagem. Com dois perfis e a opção de criar conta, a cena recebe
**17 de 24 linhas** ou **29 de 36 linhas**. A moldura é centralizada, o perfil
selecionado tem preenchimento destacado e um contador mostra a posição na lista.
ID e nome não são repetidos quando são equivalentes sem distinguir caixa. Em
janelas pequenas, a moldura/paisagem cedem espaço à lista e aos controles.

Na TUI, a altura da arte é o menor valor entre 36, metade das linhas do terminal e
as linhas disponíveis após reservar 10 para a interface. Por exemplo, um terminal
de 40 linhas recebe 20 linhas de cena. **Não use o espaço inteiro do terminal para
o widget:** isso pode deixar apenas a última linha de um aviso visível. A lista de
avisos continua no chat nativo acima da arte; não é apagada ou transformada em arte.
A fonte continua sendo uma escolha do emulador; esta integração não instala fontes.

## Movimento e ciclo de vida

`scripts/ui/terminal-art-animation.mjs` é a única autoridade temporal. A revelação
dura aproximadamente **1,5 s, a 12 quadros/s**: céu, luz/nuvens, montanhas, água e
marca. Ao terminar, o timer para e a composição final fica estática; não há loop
ocioso consumindo CPU. O relógio pode ser injetado em testes.

O seletor recebe teclado desde o primeiro quadro. Mudar a seleção atualiza a marca
no progresso atual, sem reiniciar a animação a cada seta. Redimensionar preserva a
seleção. Saída, cancelamento, fechamento e falhas encerram os timers/listeners
próprios e restauram o estado de entrada. Não há limpeza da tela inteira a cada
quadro.

A factory `scripts/users/startup-art.mjs` é registrada pelo runtime gerenciado com
o nome da conta e o `sessionManager` raiz. Usa o widget público `aboveEditor`,
depois do chat/avisos e antes do editor. Os quadros pedem um redesenho ao TUI, sem
escrever diretamente em stdout. `input`, `before_agent_start`, shutdown e dispose
encerram o movimento; o início da conversa retira o widget. Não reaparece em
`/new`, `/reload`, fork ou troca de sessão. Não adiciona mensagens ao histórico ou
contexto do modelo. RPC, print e sessões que não sejam a raiz TUI não recebem a arte.
`--no-extensions` continua desativando essa extensão interna.

`NO_COLOR` (inclusive vazio) desativa cores. `TERM=dumb` também desativa movimento.
`--no-animation` no preview mostra o quadro final imediatamente. Saída redirecionada
produz somente um quadro final, sem controles de cursor ou espera de animação.

## Experimentar sem instalar

Execute na raiz desta branch:

```sh
# Seletor real, mas somente com perfis sintéticos Evolvera/Pessoal.
node scripts/preview-terminal-art.mjs --select

# Animação da paisagem, com e sem marca.
node scripts/preview-terminal-art.mjs --label Evolvera
node scripts/preview-terminal-art.mjs --label Pessoal

# Amostra com tamanho explícito, sem movimento.
node scripts/preview-terminal-art.mjs --label Evolvera --width 120 --height 28 --no-animation

# Versão monocromática e sem movimento.
node scripts/preview-terminal-art.mjs --select --no-color --no-animation
```

`--select` usa as dimensões reais do terminal; `--width` e `--height` dimensionam as
amostras standalone. A animação standalone redesenha apenas as linhas que acabou de
emitir, sem levar o cursor ao topo e sobrescrever conteúdo anterior do terminal.
O CLI encerra sua própria leitura de stdin ao concluir, sem deixar o processo aberto.
O preview não lê registro, credenciais ou histórico, não cria contas e não abre
uma sessão PI. “Create new account” é apenas uma opção visual nesse preview.

## Validação e limites

```sh
node --test --test-concurrency=4 scripts/test/terminal-art.test.mjs scripts/test/account-selector.test.mjs scripts/test/startup-art.test.mjs scripts/test/terminal-art-animation.test.mjs
```

Os 36 testes focados passaram em aproximadamente 0,57 s, com quatro workers e
isolamento de processo por arquivo. Usam streams/relógios sintéticos e, para o
wiring, leitura do fonte: `NO_STATEFUL_RESOURCES`. A revisão do orçamento da TUI
recebeu também sua validação focada após o ajuste de altura.

A abertura real foi observada no SDK **1.3.0/Linux**, em PTYs 120×40, com perfis
sintéticos EVOLVERA/Pessoal e HOME, agentDir, registro, stage, cache e sessões
próprios em `mkdtemp`. Não havia credenciais, ferramentas ou MCP, e fetch/sockets
estavam bloqueados. Ambos os processos saíram com código 0 em cerca de 6,7–7,0 s.
Os quadros nativos mudaram ao longo da entrada; os avisos ficaram acima da cena,
a marca apareceu só para EVOLVERA e a primeira entrada retirou a arte. Após a
revelação, uma janela de observação de 450 ms não recebeu bytes de animação.
O preview interativo 120×24 também encerrou com código 0 após a seleção.

A validação nativa encontrou e corrigiu dois problemas antes da entrega: um widget
alto demais ocultava o início dos avisos, e o preview standalone mantinha stdin
ativo após selecionar. Esses ajustes não alteram credenciais, históricos nem o
pacote instalado. Não há patch do SDK, instalador modificado ou instalação global.
Não foram exercitados Windows, macOS, outros SDKs/fontes/emuladores ou chamadas a
provedores. A baseline 0.83.0 ainda citada no README não foi validada.
PR e merge continuam dependendo da aprovação posterior do usuário.
