# Glass without the AI look

Glassmorphism is not forbidden. What gives the AI look is **decorative glass**: milky blur over a flat gradient, a white border and glow, repeated on content cards. Real glass is a **layer with a function** that lets you see what is behind it and, when possible, distorts that background at the edges.

## Quick diagnosis

| AI glass | Real glass |
|---|---|
| Flat background or a gradient with nothing to show | A photo, a map, vivid colour or content scrolling behind |
| Milky white, almost opaque | Transparency that preserves shape and colour |
| `blur(24px)` + white border + glow | Medium `blur` + `saturate`, light on the top edge, shadow underneath |
| Glass on a card, form, table | Glass only on a floating layer: nav, sheet, modal, HUD |
| Several stacked glasses | One glass layer per screen |
| Text with no contrast | Text legible at the worst point of the background |
| No fallback | A solid fallback when there is no support |

## Where it is legitimate

- **A floating navigation bar** over scrolling content.
- **A bottom sheet / modal / popover** over a screen that stays visible.
- **A HUD or control over media** (player, map, camera).
- **A sticky header** that must show content passing underneath.
- **One highlight piece** where the glass is the subject (a hero card, a lens).

If the background behind is flat, the glass has nothing to show. In that case, a solid surface.

## Rules

1. **Only where there is a layer.** Glass exists to separate planes. If there is no plane behind, it is texture, and glass texture is decoration.
2. **The background must be worth it.** Shapes, colour, a photo or movement. Glass over a flat `linear-gradient` is the AI default.
3. **One glass per screen.** At most one system (nav + sheet may share the same recipe). Glass over glass turns to jelly.
4. **Legibility first.** AA contrast at the worst point of the background. If it fails, raise the opacity or put a local scrim behind the text.
5. **Glass is not primary content.** Forms, tables and reading text stay on a solid surface.
6. **Coherent light.** A light highlight on the top edge, a dark shadow below. An outward glow is not light, it is slop.
7. **Performance.** `backdrop-filter` is expensive: small area, no animating the blur, solid fallback.
8. **Short motion.** Enter/exit in 160–240 ms; respect `prefers-reduced-motion`.

## Recipe A — contained glass (pure CSS)

The reliable way: blur + saturation + layered transparency + edge light. It does not distort, but reads as glass.

```css
.glass {
  --glass-blur: 14px;
  position: relative;
  background: linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,.05));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(165%);
  backdrop-filter: blur(var(--glass-blur)) saturate(165%);
  border: 1px solid rgba(255,255,255,.22);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.38),   /* light from above */
    inset 0 -1px 0 rgba(0,0,0,.28),        /* shadow below */
    0 12px 32px rgba(0,0,0,.28);           /* real depth */
  color: #fff;
  text-shadow: 0 1px 2px rgba(0,0,0,.45);
}

/* corner sheen, not glow */
.glass::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(135deg, rgba(255,255,255,.18), transparent 42%);
  mix-blend-mode: screen;
}

/* fallback: with no support, the glass becomes a solid surface */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass { background: rgba(18, 20, 24, .94); }
}
```

For a light background, invert: `rgba(0,0,0,.10)` to `rgba(0,0,0,.04)`, border `rgba(255,255,255,.55)`, dark text.

## Recipe B — real refraction

`backdrop-filter` only **blurs**; it does not bend. For the background to look seen through a lens you need a **copy of the background** inside the glass, enlarged, blurred and offset. The edge shows the distortion.

```html
<div class="lens">
  <div class="lens__bg" aria-hidden="true"></div>
  <div class="lens__content">…</div>
</div>
```

```css
.lens {
  position: relative;
  overflow: hidden;
  border-radius: 20px;
  isolation: isolate;
}

.lens__bg {
  position: absolute;
  inset: -6%;
  background-image: url("background.jpg");
  background-size: cover;
  background-position: center;
  background-attachment: fixed; /* aligns with a fixed page background */
  filter: blur(9px) saturate(150%);
  transform: scale(1.05);       /* the edge "bends" what is behind */
  z-index: -1;
}

.lens__content {
  position: relative;
  padding: 20px;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0,0,0,.5);
}
```

`background-attachment: fixed` only aligns if the page background is also fixed. If the section has its own image, use the same image and the same position in both. That is the most controllable case.

For the edge to really distort, apply an SVG filter to the background copy (not to `backdrop-filter`, whose support is uneven):

```html
<svg width="0" height="0" aria-hidden="true">
  <filter id="refract">
    <feTurbulence type="fractalNoise" baseFrequency="0.006 0.01" numOctaves="2" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="14"
      xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</svg>
```

```css
.lens__bg { filter: blur(7px) saturate(150%) url(#refract); }
```

Use a low `scale` (10–18) with blur on top: the distortion shows at the edge without misaligning the middle. It is expensive. Keep it for one piece, not the whole screen. True real-time refraction (a lens over video, for example) needs WebGL; it is only worth it when the glass is the product.

## Checklist

- [ ] What is behind the glass? If nothing, use solid.
- [ ] Does the text pass AA at the worst point of the background?
- [ ] Does the light come from above (highlight on top, shadow below)?
- [ ] Is it the only glass layer on the screen?
- [ ] Does the glass have a function (separating planes) or is it decoration?
- [ ] Is there a solid fallback?
- [ ] Is the area small enough for `backdrop-filter` not to weigh?
