# Full anti-slop catalogue

Patterns to recognise, with what they are and how to fix them. It complements the quick checklist in `ai-aesthetics.md` and the visual gallery `gallery.html`.

> Source of the patterns: [impeccable.style/slop](https://impeccable.style/slop) (Impeccable, by Paul Bakaus), adapted to the voice of this skill.

Two marks:

- **AI slop** — visual habits typical of AI models.
- **Quality** — problems that make the interface harder to use.

---

## 1. Your design system

Patterns that check the screen against the project's own `DESIGN.md` / `recipes.md`.

### Font outside the design system *(Quality)*
The font used is not in the project's type system. Use an approved one, or record the addition if it is intentional.

### Colour outside the design system *(Quality)*
The colour is not in the documented palette. Use a palette colour, or add the new one to the system.

### Radius (border-radius) outside the design system *(Quality)*
The radius used is not on the documented scale. Use an existing radius, or update the system to include the new shape.

### Font size outside the design system *(Quality)*
The size is not on the type scale. Use an existing step, or add a new one to the scale.

---

## 2. Visual details

### Decorative grid background *(AI slop)*
A grid of lines in the background only decorates, without helping to use the page. A grid only for a canvas, a map or a task that needs measuring.

### Accent border on a rounded element *(AI slop)*
A thick coloured border makes the outline of the card compete with the content. Use a lighter border, or let the background define the card.

### Glassmorphism everywhere *(AI slop)*
Blur, glass cards and a glowing border used as decoration, not to solve a real layer. Glass needs content behind it and a function; if the background is flat, use solid. Real glass (blur + saturation + edge light + refraction) is allowed: recipe in `glass.md`.

### Side accent border (side-tab) *(AI slop)*
A thick coloured strip on the side makes an ordinary card look like an alert. Remove it when there is no status or warning to communicate.

### Thin border + wide shadow *(AI slop)*
A 1px border and a wide shadow define the same card. Choose one: the border or the shadow.

### Repeated gradient stripes *(AI slop)*
Repeated stripes fill empty space with noise. Use a plain surface, or a texture that belongs to the design.

### Extreme border-radius on cards *(AI slop)*
A large radius squeezes the content and makes every card look the same. Reduce the curve to the size of the card.

### Crude SVG illustrations *(AI slop)*
A mascot or scene drawn in a hurry leaves the page looking unfinished. Use a well-made illustration or a photo, or remove it.

---

## 3. Typography

### Label above a title *(AI slop)*
A small label above the title adds a line of reading. Remove it if it repeats the title, or merge the useful words into the title itself.

### Tiny interface text *(Quality)*
Navigation, links and controls become hard to use when the text is too small. Increase it to read without zooming.

### One word alone on the last line *(Quality)*
A paragraph that ends on a single word leaves a gap in the column. Readjust with `text-wrap: pretty` or change the measure.

### Title with a stubby last line *(Quality)*
A multi-line title whose last line is a stub looks unfinished. Use `text-wrap: balance` to even it out.

### Flattened type hierarchy *(AI slop)*
Titles and body too alike make scanning hard. Differentiate size, weight or spacing.

### Icon in a square stacked over the title *(AI slop)*
An icon in a rounded square above the title is the classic AI feature card. Put the icon beside the title, or remove the container.

### Italic serif headline *(AI slop)*
A giant italic serif is a ready-made shortcut to an "editorial look". Under the author defaults, avoid serif outside editorial products; the list of choices by tier is in `typography.md`.

### Badge above the main headline *(AI slop)*
A pill above the headline looks clickable and competes with the message. Remove it if it adds nothing, or move the information into the title.

### Giant hero title *(AI slop)*
A long headline at display size takes the first fold alone. Shorten or reduce it to leave room to explain and act.

### Squeezed letter spacing *(AI slop)*
Letters stuck together are hard to tell apart. Loosen until each character is clear, especially on small screens.

### Saturated font (Inter/Geist on everything) *(AI slop)*
Geist reads as AI at once; Inter is saturated but goes unnoticed because it resembles SF, Apple's system font, and is acceptable as a neutral. Prefer indie/lesser-known fonts; the list by tier is in `typography.md`.

### One font for everything *(AI slop)*
One family can work across the page; if everything looks flat, vary size/weight/space before deciding on a second family.

### Running text in uppercase *(Quality)*
Long passages in capitals are tiring. Use sentence case in the body; capitals only in short labels or titles.

---

## 4. Colour & contrast

### Radial gradient halo background *(AI slop)*
A light halo behind the content is the classic AI background. Slop when it is the whole screen; a focal halo (a light, a sky) with a purpose passes. Remove it when it competes with the content or has no role.

### Soft spotlight behind the content *(AI slop)*
A glow behind a section gives emphasis without explaining what matters. One spotlight, with meaning, is fine; several become slop. Use spacing, contrast or a clear title.

### AI colour palette *(AI slop)*
Purple in gradient and bright cyan on a dark background are AI defaults. Build the palette from the product's identity.

### Dark mode with glowing accents *(AI slop)*
Accents with glow on everything become a wall of neon. One focal bright accent (the star, the highlight) is welcome; the wall is not. Reduce the glow so the useful information shows.

### Gradient text *(AI slop)*
A gradient changes the colour along a title or number, for decoration only. Use a solid colour and give emphasis with size/weight.

### Grey text on a coloured background *(Quality)*
Neutral grey looks washed out on a coloured surface. Use a darker tone or light text, and check the real contrast.

### Cream/beige palette *(AI slop)*
Cream and beige become a lazy substitute for a palette. Keep them when they belong to the product, and choose the rest with the same care.

---

## 5. Layout & space

### Tiny numbered section labels *(AI slop)*
Numbers beside titles add noise when there is no sequence. Numbering only for steps or an order that matters.

### Cards touching the edge of the scroller *(Quality)*
Cards stuck to the edge with no breathing room. Add equal space at both ends so the first and last have a clear limit.

### Text covered by another element *(Quality)*
An opaque layer covers legible text. Move the layer or give the text clear space.

### Unbalanced opening columns *(Quality)*
One column runs far below the other, leaving a gap. Rebalance, or move the long section below both.

### Title closer to the previous section *(Quality)*
The title sits closer to the previous block than to its own content. Give more space above than below.

### Metric layout in the hero *(AI slop)*
Giant number + small label + statistics is a landing template. Lead with a metric when it explains the product.

### Grids of identical cards *(AI slop)*
Icon + title + text repeated give the same weight to everything. Group ideas and vary the layout when the content asks for different treatment.

### Monotonous spacing *(AI slop)*
Equal spaces everywhere make it hard to see what belongs to what. Keep related things together and more space between groups.

### Nested cards *(AI slop)*
A card inside a card creates noise and depth. Flatten: use spacing, typography and dividers instead of containers.

### Line of text too long *(Quality)*
Long lines make it hard to find the start of the next one. Aim for 65–75 characters and adjust for font and screen.

### Content overflowing its container *(Quality)*
Content spills over or creates sideways scroll. Let the text wrap and the elements shrink; use a scrollable region when needed.

### Clipped menus/popovers *(Quality)*
A container clips a menu, tooltip or popover. Allow the overflow, or render the layer outside the clipping container.

---

## 6. Motion

### Pulsing status dot *(AI slop)*
A pulsing dot draws attention even when nothing changes. A still status stays still; movement signals activity that matters.

### Decorative blinking cursor *(AI slop)*
A blinking cursor makes static text look editable or like a terminal. Remove it from static copy; keep it where one can type.

### Auto-scrolling marquee *(AI slop)*
Text/logos scrolling on their own make the person read at the page's pace. Keep it still, or give a control to pause.

### Bounce/elastic easing *(AI slop)*
A dialog that bounces or overshoots makes a plain action affected. Let it settle quickly; playful movement only at a moment that fits.

---

## 7. Text (copy)

Per-language phrase lists are in `copy.md`.

### Same text repeated in a container *(Quality)*
The same label appears in several places on a card. Keep it once, where it matters.

### Em dash abuse *(AI slop)*
An em dash in every sentence is an AI habit. Use a full stop between separate ideas and other punctuation when it helps.

### Generic marketing claims *(AI slop)*
"Supercharge" and "world-class" promise without explaining. Say what the person can do and what gets better for them.

### Forced contrast ("It's not X. It's Y.") *(AI slop)*
Repeating "it's not a feature, it's a platform" makes everything sound like a slogan. Explain the distinction when it matters, and say the useful thing directly.

### Calling something "theater" *(AI slop)*
Calling it "theater" replaces explanation with disdain. Name what is ineffective and explain why.

---

## 8. Images

### Placeholder-style illustrations *(AI slop)*
A scene made of generic circles and blocks looks like provisional art. Use an image that says something specific about the product.

### Jagged image masks *(Quality)*
A jagged mask imitates a torn edge with no care. Use a cut-out made for the effect, or a clean crop.

### Images hidden under overlays *(Quality)*
An almost opaque overlay hides the image. Reduce it until the image contributes, or remove an image with no purpose.

### Broken image/placeholder *(Quality)*
An empty image or placeholder leaves the page unfinished. Add the asset and check that it loads, or remove it.

---

## 9. General quality

### JavaScript errors on load *(Quality)*
An unhandled error breaks a control or hides content. Fix it before polishing the look.

### Content stuck waiting to appear *(Quality)*
Content stays hidden when the entrance animation fails. Keep it visible by default so the page works anyway.

### Tight padding *(Quality)*
Text stuck to a button or border looks squeezed. Use the spacing scale to separate content from container.

### Body text touching the edge *(Quality)*
Paragraphs need breathing room at the sides. Add horizontal padding and check at narrow widths.

### Justified text *(Quality)*
Justified text creates gaps between words. Align left, or use hyphenation and check the spacing on each screen.

### Low-contrast text *(Quality)*
Text that blends into the background is hard to read. Raise it to WCAG AA: 4.5:1 for normal and 3:1 for large.

### Skipped heading level *(Quality)*
Heading hierarchy guides screen readers. Follow the structure: h2 under h1, h3 under h2.

### Tight line-height *(Quality)*
Lines stuck together make the paragraph hard to follow. Start at about 1.5× the font size and adjust.

### Tiny body text *(Quality)*
Small body text makes reading a burden. Start at about 16px and check with the real font on phone and desktop.

### Wide letter spacing in the body *(Quality)*
Letters too far apart make paragraphs hard to read. Keep the body near the font's default; wide spacing only on short labels.

---

## 10. Community tells

> Sources: [godobject.dev — 10 tells of a slop UI](https://godobject.dev/blog/10-tells-of-slop/), the discussion on [Hacker News](https://news.ycombinator.com/item?id=49867038) and threads on Reddit ([r/UXDesign](https://www.reddit.com/r/UXDesign/comments/1s1guo5/), [r/vibecoding](https://www.reddit.com/r/vibecoding/comments/1s37qlp/)). Complements to the patterns above; overlaps are noted.

### Rainbow of colours (rainbow vomit) *(AI slop)*
Different colours that mean nothing, only to tell fields apart. It ignores the 70-30-10 rule. Close the palette: colour only when the data asks for it, with a consistent role. *(related to "AI colour palette" and "Closed palette" in `craft.md`.)*

### Fingernail card *(AI slop)*
A rounded card with a coloured tab/strip on top that marks nothing: the "fingernail". Remove the tab when there is no status; let the content define the card. *(related to "Side accent border".)*

### Emoji on everything *(AI slop)*
Emojis scattered around: ✨ in the title, 🚀 on the button, 😊 in the empty state. They decorate without saying anything. Remove them, or use them with extreme moderation; the visual and the text already communicate.

### Misaligned element *(AI slop)*
SVG, ASCII art or an out-of-box element almost always ends up out of alignment. Check the optical alignment (icons and circles centred by eye), not only by the box. *(related to "Optical alignment" in `craft.md`.)*

### Redundant status badge *(AI slop)*
An "active"/"verified"/"online" badge that never changes: if it were not active, the person would not be seeing it. Show status only when there is a state that really varies. *(related to "Pulsing status dot" and "Pills with no meaning".)*

### `//` prefixed to tech terms *(AI slop)*
Adding `//` before any word that sounds like technology ("// interoperable") is "code look" decoration. Remove it; write the term normally.

### Text that leaks the prompt *(AI slop)*
Text that gives away the command that generated it: "Built with Hugo. Written from Neovim", "one campus. one app.", "3 apps in 1". Nobody cares about the tool or the brief. Write what the person gains, not the process. *(related to "Same text repeated" and "Obvious explanation of origin".)*

### Greeting with ✨ / screen treated as a landing page *(AI slop)*
"Welcome to your Dashboard, [Name] ✨" and a grey subtitle promising to "experience the power of...". Treating a tool as a landing page. In a tool, go straight to what matters; a greeting only if it adds something. On a screen that welcomes the person, it is worth it when it carries real data ("2 plants to check today").

### Hype words *(AI slop)*
"Elevate", "Seamless", "Next-Generation", "Supercharge", "Unleash", "Empower" and equivalents. They promise without explaining. Say what the person can do and what gets better. *(extends "Generic marketing claims".)*

### Suspiciously specific denial *(AI slop)*
When you ask the model not to do something, it makes a point of saying it did not ("no mocks", "I didn't use X"). It is over-indexing on the prompt. Remove the self-defence; it only confirms the command.

### Emerald green is the new purple *(AI slop)*
The AI default accent colour moved from purple to emerald green, but it is the same "AI default" in another colour. Use the colour of the product's identity, not the one in fashion with the model. *(related to "AI colour palette".)*

### The "shadcn / default SaaS" look *(AI slop)*
The same rounded corners, neutral grey background, subtle shadows, Inter font and the "modern SaaS" aesthetic: the default of shadcn/ui, Bootstrap and Tailwind. Everything that uses the library without customising looks the same. Choose an aesthetic with intent, not the statistical average. *(related to "Saturated font" and "Same shadow and radius".)*

### Default landing skeleton *(AI slop)*
Hero → feature grid → social proof → pricing → FAQ → footer, always in the same order. It is the structure of every shadcn/Tailwind/Vercel example, and the model reproduces it by default. Let the content dictate the structure, not the template. *(related to "Grids of identical cards" and "Metric layout in the hero".)*
