# Motion and thematic effects

## Motion

Animation explains a change of state; it never decorates.

- **Cause and effect.** Something moves because something happened.
- **Continuity.** The touched element becomes the next screen.
- **Physics of a real thing.** A spring for objects; a short ease-out (180–400 ms) for interface.
- **Two facts, one place.** The start and end of the same thing can share the space and swap.
- **One thing at a time.** Chain the steps.
- **Reduced motion.** Respect `prefers-reduced-motion`.
- **A reference's differential.** If the reference has an animation that is its differential, it goes into the prototype. Describing it does not let the user feel it.

Signs of slop motion: staggered fade on open, a glow pulsing in a loop, gradient shimmer, parallax with no function, confetti, cards "floating" on hover, a spinner where the result is instant.

## Product universe (thematic effect)

Understand the **scope** of the product: what it does, for whom, in which universe (astronomy, music, finance, health…). Every visual effect must **refer to the idea** the product serves, not decorate.

- **The metaphor comes from the product.** A stars app → constellations, a gradient crossing like a comet, a star's glow on focus. A music app → waveform, equaliser. A tides app → waves. A weather app → light and cloud. A finance app → the number as protagonist, no effect.
- **Always propose 1–3 thematic effects** tied to the universe and show them in the demo HTML. Do not decide alone.
- **Subtle and meaningful.** The effect sets the scene or explains; it never becomes an excuse for glow or confetti with no function. A signature effect is one, not five.
- **Not on every screen.** Focal and purposeful (the same limit as glow).
- **Respect reduced motion** and the *Motion* rules.
- Record the chosen effect in `taste.md`; if it is brand-level, in `recipes.md`.
