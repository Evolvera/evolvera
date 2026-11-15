# Searching for inspiration (when the user asks)

Triggered when the user asks something like "show me examples", "what would you use as reference", "inspire me on <theme>", "do it like <site>". **Do not search on your own for every screen**, only when asked.

The sources in `sources.md` are mostly **libraries of elements** (UI/UX, landing, flows). The search is not "take 3 screenshots of a page": it is **iterating over the elements** the source offers. The subagent goes in, sees what can be searched (categories, filters, keyword search) and refines until it finds the element that answers the question.

## Before searching, ask for references

> **Important!** References help direct the visual identity of the application. If you already have something in mind, attaching it helps us get closer to what you expect.

Ask the user whether they have references (a link, a screenshot, an app they like, "I want the look of X"). If they do, the search becomes **capture**, one screenshot per reference, instead of open discovery. If not, follow the discovery.

## The cycle

**Investigation → search → decision.** The main agent defines the question with the user; the subagent iterates on the sources, talking to the main agent in text; the main agent analyses the screenshots and decides **wireframe, palette, hierarchy and component**.

## Search scope

Before calling the subagent, ask the user whether the search stays within apps related to the current scope or covers any app. Example: for a hair-care app, should onboarding come only from apps for a female and beauty audience, or from apps in general? Give concrete options for this project. If they already answered for this screen, do not ask again.

## Minimum brief to the subagent

Before calling the subagent, the main agent always states:

- **Product and audience:** what the app does and for whom.
- **Scope:** only apps related to the current scope, or any app, as the user answered.
- **Platform:** phone, tablet, desktop or web. It comes from the project; if it cannot be known, ask the user before searching.
- **Type of screen:** for example, a product list.
- **Element sought:** what the reference must answer.
- **What stays out:** for example, landing pages.

The choice of sources follows the platform (see *Source by platform* in `sources.md`).

Split the search into two kinds, in this order:

1. **Screen function:** screens that do the same job (e.g. the Home of a habit or self-care app). Search by function, not by metaphor.
2. **Visual idea:** the language to explore (e.g. flower illustration). Do it separately; it serves only the visual language and does not count as a structure reference.

## What counts as a reference

The subagent collects; the main agent judges relevance. The subagent discards only what is objectively useless:

- **It is not an open example:** a listing, a collection, an error or a login screen.
- **It is the wrong platform.** In an identity search (palette, typography, surface) the platform may differ, because structure is not reused there.

When in doubt, it saves. It does not judge beauty or decide whether the reference is good. If a question ends with no candidates, that goes into the report as "not found".

## Candidate sheet

1. **Subagent:** saves each candidate at full size and builds a single image with all the numbered thumbnails, plus one line per item (number, source, link, what it shows, animation if any).
2. **Main agent:** looks at the sheet, which costs as one image, and picks the ones it wants to see.
3. **Full screenshot:** the main agent opens only the chosen ones, applies the filters and shows the user the approved ones.

Save candidates in `<project>/.deslop/inspiration/`, never inside the skill folder.

## Cheap mode × guided mode (the user chooses)

- **Cheap (default):** an almost autonomous subagent. It goes in, filters, takes the screenshots and returns. The main agent only reads the result. One round of dialogue, few tokens. Target: 5 to 8 references approved by the main agent, from at least 2 sources.
- **Guided:** the main agent takes part in the path, choosing filters and keywords together with the subagent, step by step. More tokens and better decisions; use it when the piece is critical or the direction is open. Target: 10 to 15 references approved by the main agent, from at least 3 sources.
- When in doubt, start cheap and escalate only if the result is not enough. The user decides the mode.

## The dialogue and filter discovery (text only)

The subagent and the main agent talk in **short text**, never pasting page content. The subagent does not invent the path: it **reads what the source itself offers** and proposes from that.

1. **Reconnaissance (1 screenshot).** The subagent opens the source's explore/search page and takes a screenshot. In it, it identifies the visible controls (search box, filters as chips or sidebar, categories, sorting, tabs) and notes the **exact labels** it sees (e.g. "Empty State", "Onboarding", "iOS/Android", "sort by revenue"). If it needs to read the labels, it crops the filter area.
2. **Mapping to the question (text).** The subagent crosses those labels with the main agent's question and returns: (a) what the source allows searching; (b) **2–3 concrete paths** using the real labels ("default filter → 'empty state'", "search 'empty'", "category 'Productivity'").
3. **Decision (text).** The main agent picks a path. In **cheap** mode the subagent applies the path it ranked best itself and only reports; in **guided** mode it stops and asks.
4. **Application (1 screenshot).** If the source has a platform filter, the subagent applies it first. Then it clicks/filters/types and screenshots the results. If the first screenshot comes from the wrong platform, it stops and tells the main agent, in both modes.
5. **Refinement (max. 2–3).** If the results do not answer, the subagent comes back with alternatives (synonyms, a neighbouring category, a broader or more specific term), **always in the page's own vocabulary** (the site's index is built from its labels, not from invented synonyms).
6. **Delivery.** The candidate sheet, the full screenshots saved and the report of what was not found.

**Keyword rules:** use the source's vocabulary (labels/terms in its UI), not yours. If the site is in English, search in English, mapping the user's intent from their language. Start with the most specific and widen ("empty state" → "empty" → "states"). A short list at a time (2–4 terms) for the main agent to choose from, not 15. Prefer what the page suggests (autocomplete, search examples, tags) over a guessed term. If the main agent knows the domain, it injects the synonyms and the subagent tests them.

## Who browses, and how

- **Main agent:** defines the question, decides the mode, directs the dialogue and analyses the screenshots. It is the only one that judges quality and applies it to the project. Before showing the user, it discards what is off-platform.
- **Reference subagent (cheaper model):** browses, takes screenshots, saves them and delivers the *Candidate sheet*. It discards only what is objectively useless, does not judge relevance or beauty, and reports what it did not find.

## Budget and rules

1. **Quantity by usefulness.** Follow the mode's target, counting only what the main agent approved. The main question needs at least 3 examples. The subagent collects about double the target, because part will be cut.
2. **Screenshot, not DOM.** The subagent captures the image of the screen. It does not read the DOM, the accessibility tree or the page text (reading the page also burns tokens, and the screenshot already has everything). The exception is a source made for agents, such as the Markdown files of GradientDeck UI: there, read the file.
3. **Code only for technique.** If the screenshot does not answer *how* to do a detail (the easing, the SVG, the grid), the subagent inspects **that element**, never the whole page.
4. **A reference becomes concept.** The main agent applies *hierarchy, rhythm, metaphor* to the project, never a copy of palette, font or literal layout.
5. **Filter through the collection.** Before using an example, the main agent runs it through `ai-aesthetics.md` and `catalog.md`. Good references come contaminated too.
6. **No subagent or browser.** Use the bundled `inspiration/` collection as fallback and tell the user.

## After the search

- **Check before showing.** The main agent compares the result with each question, in both modes. If the main question went unanswered, run another round or say clearly what was not found; never fill in with something similar.
- **A source that failed.** Tell the user and suggest another source or logging in. Do not continue as if it had been consulted.
- **Go back to structure.** If the search happened after the wireframe and brought screen-function references, redo the skeletons before asking which to follow. Each skeleton cites the reference that inspired it. Keep the previous option in the comparison only if it still makes sense.
- The main agent analyses the screenshots and the script. If the differential is an **animation**, it is **reproduced in the HTML**: describing is not enough, the user needs to feel it to judge.
- Record the choices in `taste.md`.
