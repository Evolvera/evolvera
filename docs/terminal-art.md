# Static terminal artwork

`scripts/ui/terminal-art.mjs` is the single artwork source. It exports:

```js
renderTerminalArt({ width = 80, height = 12, label = '', color = true } = {}) // string[]
isEvolveraLabel(label) // boolean
```

The renderer is synchronous and pure: no environment, terminal, filesystem, network,
clock, dependencies, or ambient randomness. Callers own available-space calculation,
margins, and whether to enable ANSI color. Every colored line restores SGR style;
there are no cursor commands or OSC sequences. `color: false` emits no escapes.

## Composition and sizes

The sunset is a new terminal-native composition inspired by Kevin's private **Acid
Shellscape**, source commit `9075be47288d4b85a9eadb59234cbc769a02e130`.
Only its supplied README, token palette, and sunset reference informed this
translation; no private source, original screenshots, or full design copy are
vendored. The original private design remains © Kevin; this translation does not
assert a license for that source.

Five design rules are retained:

- Crisp blocks, half blocks, halftones, and dots, rather than smooth shading.
- Stable coordinate hashing with a fixed seed; never `Math.random()`.
- Lighter distant mountains, solid middle layers, denser foreground/reflection
  characters drawn from ` .:-=+*#%@$`.
- No smooth gradients, blur, shadows, or animated effects.
- At most five accent colors: dominant purple, lilac, coral, acid yellow, blue.
  The dark purple ground is a neutral canvas, not another accent.

Terminal cells are treated as 1:2 rectangles. Two square-pixel logo samples become
one `▀`, `▄`, or `█` cell. ASCII, blocks, and shade characters are single-column
terminal glyphs; no emoji, combining characters, or ambiguous wide symbols are used.

At ≥72 columns and ≥12 rows the full composition uses larger marks and more
landscape detail. At ≥40 columns and ≥6 rows it retains both appropriate marks,
their names, a sunset, mountains, and sea at lower resolution. In particular,
80×8 retains the scene rather than becoming only a wordmark. Smaller surfaces use
`PI` (and ` / evolvera` when appropriate) truncated to the available width.

Finite numeric dimensions are floored and clamped to nonnegative integers.
Invalid/nonfinite dimensions become zero; any zero dimension returns `[]`.
Allocation is capped at 112 columns × 12 rows even for huge finite requests.
Defaults apply to omitted/undefined dimensions. Output never exceeds requested
width or height; monochrome trailing blanks may be trimmed.

## Logo provenance and conditional branding

The PI mark is derived from the official <https://pi.dev/logo-auto.svg> supplied
locally for implementation. Cropping its transparent margin reveals an exact
four-unit grid: coral horizontal top and right return, blue angular lower-left,
and yellow lower-right vertical stem. The terminal version preserves this geometry
and the three color roles, using the scene's acid yellow. It is not the letter
`π` or a typographic substitute.

The Evolvera triangular mark is sampled from the supplied official
<https://evolvera.com.br/logo.svg>. The cropped SVG silhouette is encoded as
18×16 and 12×10 square-pixel masks. Its open triangular silhouette and disconnected
upper/left joint are retained; the original blue facets/gradient are intentionally
flattened to the palette's one blue. No SVG rasterization happens at runtime.

PI's mark and name remain present at normal/compact sizes. **Only** a string whose
`trim().toLowerCase()` equals `evolvera` adds the Evolvera mark and name.
`Evolvera Labs`, IDs, providers, OS users, objects, and missing labels do not.
The exact label decision is shared through `isEvolveraLabel`; this renderer does
not perform account lookup or fallback inference.

## Focused validation

```sh
node --test --test-concurrency=1 scripts/test/terminal-art.test.mjs
```

This is an in-memory `NO_STATEFUL_RESOURCES` test: no fixtures are written, no
services are called, and no cleanup hooks run. Tests cover bounded dimensions,
normalization, determinism, SGR-only color, monochrome equivalence, and sampled
logo silhouettes in full and compact layouts.

## Onde aparece e como experimentar

O seletor (`scripts/users/account-selector.mjs`) usa a conta **destacada** para
escolher a composição. A opção de criar conta não tem marca Evolvera. Em janelas
baixas a paisagem é omitida para manter o título, a navegação e as contas acessíveis;
redimensionar recalcula a composição sem perder a seleção.

Na sessão, `scripts/users/startup-art.mjs` é uma factory interna registrada pelo
runtime gerenciado, com o nome exibido da conta e o `sessionManager` raiz. O widget
`aboveEditor` fica depois do conteúdo/avisos do chat e antes do campo de entrada;
não substitui o cabeçalho nem atrasa, apaga ou intercepta avisos assíncronos. Sai no
primeiro evento `input` ou `before_agent_start`. Não reaparece em `/new`, `/reload`,
fork ou troca de sessão. Não produz mensagens de histórico nem contexto do modelo.
RPC, print e sessões que não sejam a raiz TUI não recebem o widget. `--no-extensions`
continua desativando as extensões internas, inclusive essa arte da sessão.

A composição inicial tem até 12 linhas, reservando 10 para a interface existente;
terminais muito baixos a omitem. `NO_COLOR` (inclusive vazio) e `TERM=dumb` desativam
as cores da arte, sem desativar o controle de cursor necessário ao seletor interativo.
A fonte pertence ao emulador de terminal: o PI não instala nem força JetBrains Mono.

Execute na raiz **desta branch**, sem instalar ou alterar o PI em uso:

```sh
# Seletor real, mas apenas com contas sintéticas; não abre uma sessão PI.
node scripts/preview-terminal-art.mjs --select

# Com e sem a marca Evolvera.
node scripts/preview-terminal-art.mjs --label EVOLVERA
node scripts/preview-terminal-art.mjs --label Pessoal

# Composição compacta, monocromática.
node scripts/preview-terminal-art.mjs --label Evolvera --width 56 --height 8 --no-color
```

Esse preview serve para avaliar a aparência e o seletor. Ele não autentica, não lê
registro, credenciais ou histórico, não cria contas e não simula uma conversa com
um modelo. Selecionar “Create new account” mostra apenas a composição sem Evolvera.
A validação da TUI nativa é separada do preview.

## Evidência e limites da integração

Os testes focados usam streams e sessões sintéticas, sem recursos persistentes:

```sh
node --test --test-concurrency=3 scripts/test/terminal-art.test.mjs scripts/test/account-selector.test.mjs scripts/test/startup-art.test.mjs
```

Na implementação inicial, 7 testes do renderer passaram (1 worker, 75 ms), mais 17
testes de seletor/lifecycle. A abertura real foi observada no SDK **1.3.0**, em PTYs
100×36, com dois processos em paralelo e contas sintéticas EVOLVERA/Pessoal. Cada
processo tinha HOME, agentDir, registro, perfis, cache, stage e sessões próprios em
`mkdtemp`; não havia credenciais, ferramentas ou MCP, e fetch/sockets estavam
bloqueados. Ambos encerraram com código 0 em aproximadamente 5,64 s, sem tentativa
de rede. Os avisos nativos ficaram acima da arte, PI permaneceu nos dois casos,
Evolvera apareceu só para EVOLVERA, e enviar uma entrada removeu a arte. A falha de
autenticação esperada nesse fixture sem credenciais não foi uma chamada a provedor.
O pacote instalado permaneceu inalterado.

Essa observação cobre a UI no SDK 1.3.0 em Linux. Não certifica outros SDKs, Windows,
macOS, fontes ou todos os emuladores. A baseline 0.83.0 ainda citada no README não
foi exercitada. Não há patch do SDK, alteração de instaladores ou instalação global.
PR e merge dependem da aprovação posterior do usuário.
