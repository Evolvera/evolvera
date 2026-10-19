# Arte de entrada — Acid Shellscape

A entrada combina uma paisagem ampliada de pôr do sol, uma revelação animada em
camadas e um seletor de perfis inspirado em telas de videogame. Depois da entrada,
a cena permanece viva: brilho, nuvens, ondas e reflexos se movem continuamente.
No perfil Evolvera, o antigo marco com a logo é substituído por uma embarcação
japonesa com a marca na bandeira.

## Composição e identidade

- Céu em faixas discretas de roxo, lilás e coral, sol com halo pontilhado, três
  planos de montanhas e reflexo na água. Sem blur ou gradiente suave.
- Campos de cor usam espaços com fundo ANSI; meios-blocos conservam a proporção
  1:2 da célula de terminal. Texturas são estáveis por coordenada, sem RNG por quadro.
- A embarcação é uma interpretação em pixel art da referência fornecida pelo
  usuário: casco largo, galerias fechadas, cabine elevada com telhado japonês,
  mastros e muitos remos dourados. Não é um veleiro genérico.
- A bandeira clara carrega a máscara oficial de 40×34 pixels da Evolvera,
  reamostrada para o tecido e deformada com ele. Não há bandeira japonesa nem
  uma logo gigante separada do navio. O casco balança, os remos fazem um ciclo
  coordenado e a bandeira ondula.
- **Não há logo nem texto PI na arte personalizada.** O pequeno cabeçalho nativo
  do SDK continua pertencendo ao próprio PI e não é substituído por esta integração.
- O conjunto **navio + bandeira Evolvera** aparece somente quando o **nome exibido**
  da conta é uma string cujo `trim().toLowerCase()` seja `evolvera`. Não há fallback
  para ID, provedor, usuário do sistema ou nomes como `Evolvera Labs`.
- Outros usuários recebem a paisagem animada sem navio ou marca. No seletor, a
  conta destacada determina a composição; “Create new account” não recebe o navio.

A referência é o **Acid Shellscape** privado de Kevin, commit
`9075be47288d4b85a9eadb59234cbc769a02e130`: README, tokens e imagem do tema poente.
A implementação é uma tradução nativa para células de terminal, não um Canvas
embutido. A fonte privada permanece © Kevin; seu código completo e capturas não
são vendorizados nem recebem uma licença nova por esta tradução.
A geometria da marca vem de <https://evolvera.com.br/logo.svg>.
Nenhuma imagem, fonte ou recurso remoto é baixado durante a execução.

## Renderização e tamanho

`scripts/ui/terminal-art.mjs` é a autoridade da composição. A geometria do navio
fica em `scripts/ui/terminal-art-ship.mjs` e a máscara oficial da bandeira em
`scripts/ui/terminal-art-masks.mjs`:

```js
renderTerminalArt({ width = 80, height = 24, label = '', color = true, progress = 1, timeMs = 0 } = {}) // string[]
isEvolveraLabel(label) // boolean
```

O renderer é puro: sem relógio, timers, ambiente, I/O ou aleatoriedade externa.
`progress` varia de 0 a 1 e revela a composição uma vez. `timeMs` determina a fase
ambiente num ciclo coerente de 24 s; inválidos viram zero e valores finitos enormes
são reduzidos antes dos cálculos. A entrada não é reiniciada a cada ciclo. Padrões
e montanhas permanecem estáveis, sem trocar a semente aleatória por quadro.
Todos os quadros
mantêm o mesmo orçamento de linhas/colunas. Dimensões finitas são arredondadas para
baixo e limitadas a **240 colunas × 40 linhas**; inválidas ou não positivas não
alocam uma cena. Superfícies pequenas conservam uma paisagem proporcional e omitem
o navio quando ele não seria legível. ANSI é apenas SGR, com reset ao fim de cada
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
navio. Depois, o mesmo timer continua emitindo `(progress: 1, elapsedMs)` para o
movimento ambiente; não há um segundo mecanismo nem repetição da entrada. O relógio
pode ser injetado em testes. Enquanto a cena está aberta há trabalho contínuo de
renderização; isso é intencional e pode custar mais em terminais grandes/remotos.
A animação só termina ao deixar a tela, começar a conversa, fechar a saída ou
optar pela versão estática.

O seletor recebe teclado desde o primeiro quadro. Mudar a seleção atualiza a marca
no progresso atual, sem reiniciar a animação a cada seta. Redimensionar preserva a
seleção. Saída, cancelamento, fechamento e falhas encerram os timers/listeners
próprios e restauram o estado de entrada.

`scripts/ui/terminal-art-output.mjs` é a única saída animada direta do seletor e do
preview standalone. Usa um viewport na tela alternativa e coordenadas absolutas,
com CR explícito e uma coluna de segurança contra autowrap. Cada atualização é
um único write sincronizado, apenas com as linhas alteradas e preenchidas até sua
largura: não apaga a linha antes de repintar, não emite LF e não reescreve o HUD
estático. A limpeza inicial não se repete a cada quadro. Ao sair, restaura a tela
principal quando a saída ainda está disponível.

Se `write()` devolver `false`, guarda apenas o pedido mais recente e nem gera os
quadros intermediários. `drain` pinta o estado atual, sem reproduzir uma fila de
frames antigos; o teclado continua atualizando a seleção enquanto a saída espera.
O renderer também reaproveita foreground/background ANSI independentes, sem
alterar os pixels, e evita repetir cálculos constantes dentro do laço de pixels.

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

# Cena contínua com navio / paisagem contínua sem navio. Ctrl+C encerra.
node scripts/preview-terminal-art.mjs --label Evolvera
node scripts/preview-terminal-art.mjs --label Pessoal

# Amostra com tamanho explícito, sem movimento.
node scripts/preview-terminal-art.mjs --label Evolvera --width 120 --height 28 --no-animation

# Versão monocromática e sem movimento.
node scripts/preview-terminal-art.mjs --select --no-color --no-animation
```

`--select` usa as dimensões reais do terminal; `--width` e `--height` dimensionam as
amostras standalone, sempre limitadas ao viewport atual. A animação usa a tela
alternativa: não sobrescreve o conteúdo anterior da tela principal e o devolve ao
sair. `--no-animation` imprime uma cena estática que permanece na tela principal.
Em `--label`, a cena fica aberta até Ctrl+C (saída 130), SIGTERM (143) ou falha da
saída; não encerra automaticamente após a entrada. Em `--select`, escolher/cancelar
encerra o timer. O CLI libera sua leitura de stdin ao concluir.
O preview não lê registro, credenciais ou histórico, não cria contas e não abre
uma sessão PI. “Create new account” é apenas uma opção visual nesse preview.

## Validação e limites

```sh
node --test --test-concurrency=5 scripts/test/terminal-art.test.mjs scripts/test/account-selector.test.mjs scripts/test/startup-art.test.mjs scripts/test/terminal-art-animation.test.mjs scripts/test/terminal-art-output.test.mjs
```

Os **51 testes focados** passaram em aproximadamente **1,90 s**, com cinco workers
e isolamento de processo por arquivo numa máquina com 12 CPUs lógicas. Usam
streams/relógios em memória e leitura do fonte: `NO_STATEFUL_RESOURCES`. Cobrem
geometria, identidade, movimento contínuo, Unicode, navegação, backpressure,
resize, modo estático, callbacks reais de `Writable`/EPIPE e sinais.

Uma comparação independente com o renderer anterior conferiu **180 casos
coloridos, 529.230 células**, além das versões monocromáticas, sem diferença de
glifos ou RGB. No microbenchmark de 48 quadros a 120×33, a serialização passou de
48.836 para 34.644 bytes/quadro (**29% menos**); a mediana do renderer puro caiu de
3,76 para 2,47 ms. Isso não mede a latência gráfica do emulador.

Em saída congestionada, 120 ticks não geraram nem escreveram frames adicionais:
apenas o primeiro write ficou pendente, em vez dos aproximadamente 2,4 MB da
reprodução anterior. O teste libera `drain`, verifica somente o estado mais
recente e confirma que seleção/cancelamento continuam disponíveis.

PTYs Linux reais, com ONLCR desativado, exercitaram o seletor, resize, cena
contínua e cena estática. As setas atualizaram o destaque em aproximadamente
13–14 ms; selecionar levou aproximadamente 9 ms. Ctrl+C encerrou a cena contínua
com código 130. A reprodução dos bytes em xterm-headless confirmou zero rolagens
na tela alternativa, restauração do conteúdo principal e permanência da cena
estática.

O SDK **1.3.0/Linux** também foi aberto em PTYs 100×36 com perfis sintéticos
EVOLVERA/Pessoal e HOME, agentDir, registro, stage, cache e sessões próprios em
`mkdtemp`. Sem credenciais, ferramentas ou MCP, e com fetch/sockets bloqueados,
ambos encerraram com código 0 em aproximadamente 6,2 s, sem tentativa de rede.
Os avisos permaneceram acima da cena e a primeira entrada removeu a arte. Não
houve patch nem instalação do SDK; os hashes dos entrypoints conferidos ficaram
iguais. Nenhum processo desses testes ficou ativo.

A validação acima observa protocolo, células e PTY, não uma captura gráfica do
Orca. Não foram exercitados Windows, macOS, outros SDKs/fontes/emuladores ou
chamadas a provedores. A baseline 0.83.0 ainda citada no README não foi validada.
PR e merge continuam dependendo da aprovação posterior do usuário.
