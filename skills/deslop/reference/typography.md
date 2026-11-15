# Typography without the AI look

The font is the slop signal that gives the product away fastest: it is the first thing the person sees and the easiest to recognise as "generated". The author default is to **prefer independent, lesser-known fonts**, avoid serifs, and keep a short list of well-made neutrals that go unnoticed (Inter, for example: it has an AI look, but because it resembles SF, Apple's system font, it slips by).

These are starting preferences. The project's `profile.md`, `recipes.md` and `taste.md` override them.

## Rules

1. **Prefer indie / lesser-known.** A font every template uses gives the product away at once. Fonts from independent studios give personality with no effort.
2. **Avoid serif by default.** Sans serif for body and UI. Serif only when the product is truly editorial (newspaper, magazine, long-text portfolio), and then as an accent, not as the default. If the project chooses serif, its choice holds.
3. **A neutral can be the anchor.** Inter and the system stack (SF Pro / Segoe / Roboto) go unnoticed and are the safe choice when the project wants an "official app" look.
4. **At most two families.** One display (titles) + one for text. If the display is indie, pair it with a neutral for text.
5. **It comes from `recipes.md`.** The chosen font goes into the project's ruler, with weights and sizes. Do not change it per screen.
6. **Check the licence.** Google Fonts and Fontshare are free; some indie ones (Söhne, Untitled Sans) are paid. Use them only if the project has a licence.

## What to use

### Indie / lesser-known (personality)

- **Satoshi** — neutral grotesque, very versatile (Fontshare).
- **General Sans** — clean geometric (Fontshare).
- **Switzer** — Swiss grotesque, excellent for body (Fontshare).
- **Cabinet Grotesk** — strong for titles (Fontshare).
- **Clash Display** — display only (titles), not for text (Fontshare).
- **HK Grotesk** — solid and little used (Google).
- **Archivo** — wide family, with variable axes (Google).
- **Instrument Sans** — contemporary neutral (Google).
- **Aspekta** — modern, discreet grotesque (free, own site).
- **Onest** — humanist geometric (Google).
- **Cal Sans** — display with character, a good accent (free).

### Neutrals that go unnoticed (system-font look)

- **Inter** — resembles Apple's SF; neutral and safe (Google).
- **System stack** — `-apple-system`, `SF Pro`, `Segoe UI`, `Roboto` — no font look at all, because it is the device's own.
- **Manrope** — a geometric that reads as neutral (Google).
- **Figtree** — clean and discreet (Google).
- **Poppins** — a round geometric that became standard; passes without an AI look (Google).

### Premium (with a licence only)

- **Söhne**, **Untitled Sans** — the "studio" neutrals behind many large brands. High cost; worth it when the project asks for a strong identity.

## What to avoid (instant AI look)

- **Montserrat, Raleway, Lato, Open Sans** — the classic template slop.
- **Plus Jakarta Sans, Outfit, Sora, Space Grotesk, Bricolage Grotesque** — the face of the "generated modern SaaS".
- **Geist** — Vercel's font; reads as AI at once, unless the product is a dev tool and you adopt it on purpose.
- **DM Sans, Urbanist** — already heading to saturated; use with caution.

## Quick pairing

| Personality | Display | Text |
|---|---|---|
| Neutral / official app | Inter (semibold) | Inter (regular) |
| Modern indie | Clash Display / Cabinet Grotesk | Satoshi / Switzer |
| Editorial (exception) | the project's serif | sans-serif neutral |
| Dev tool | Geist (on purpose) | Geist |

## Checks

- Does the font have personality, or is it the first one the model suggests?
- Two families at most?
- Did a serif appear outside an editorial product?
- Is the font in `recipes.md` (fixed weights and sizes)?
- Is the licence cleared for the project?
