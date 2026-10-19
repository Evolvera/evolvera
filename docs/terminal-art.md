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
