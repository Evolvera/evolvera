# Craft, finish and variations

## Craft: against the ugly

Rules that do not guarantee beauty but prevent ugliness. Check them in the second check. Beauty comes from the *Finish*.

- **Spacing on one scale** (4, 8, 12, 16, 24, 32…). No loose values. More space between groups than inside them.
- **Type on a proportional scale:** few sizes and at most two weights per screen. Hierarchy by size and weight, not by colour and uppercase together. The font itself comes from `typography.md`.
- **Consistent radii:** the inner radius is the outer radius minus the spacing between them.
- **Contrast:** main text at AA contrast; secondary text never lighter than the limit over the card.
- **Optical alignment:** icons and circles centred by eye; numbers in columns use tabular figures.
- **One surface only** (recipe in `recipes.md`) and at most three levels of depth.
- **Closed palette:** colours outside the palette only when the data asks for it, and with the same role on every screen.

## Finish

Removing slop does not make the screen ready: it may be correct and raw, looking like an SVG rather than an app. This stage gives light, shape and volume, lightly. Start only with structure and identity approved.

- **One light.** Everything is lit from the same direction. Soft shadow tinted by the surface colour, never black.
- **Shadow with a function.** Only on what floats or touches something (a panel, a button, a resting object). At most two levels.
- **Less geometric shape.** A curve at the edge of a scene, overlapping elements and radii with a purpose, instead of stacked rectangles.
- **Illustration with volume.** Varied stroke or no outline, tones within the same colour, a little light and details of the real object.
- **Tonal gradient only.** Within the same colour, to give volume. No rainbow.
- **Light texture, when it fits.** Subtle grain, if the project asks for it.
- **Still forbidden:** outer glow, blur blobs, the same shadow on everything, and any effect that hurts reading.
- **Show the doses.** Present the screen with no finish, a light dose and a medium dose, with the same data. The user chooses, and the approved recipe goes to `recipes.md`.
- **Check feasibility.** Before asking, say what the final platform can reproduce (the prototype is HTML; the app may not be).

If `recipes.md` says "everything flat", ask before going against it.

## Variations

Use when the direction is unclear or the user asks. Do not make variations for every screen.

- **Vary one meaningful axis at a time**, never colour alone (density, hierarchy, visual metaphor).
- **Choosing a bundle does not decide everything.** If an option mixes colour, font and surface, the choice counts only for the axis being asked. Ask the others separately before writing to `recipes.md`.
- **At most three options, in one HTML**, with a switch to alternate, same data and same state.
- **Each option with a name and a one-sentence reason**, citing the foundation.
- **Start from what `taste.md` indicates**; references become concept, never copy.
- When the user chooses, record it in `taste.md`.

## Illustration and icons

Follow `profile.md`. The author defaults are: UI icons as the product's own SVG, in the product's style; for illustration and scenes (a flower, a mascot, a texture), generate an **image** when the agent can, and draw a **vector in SVG** when it cannot or when the user dislikes the generated image. A project that uses an icon library keeps it: pick one library, one weight and one size grid, and do not mix sets.
