---
name: deslop
description: Takes the "AI slop" out of an existing interface, or builds a new one without it. Use when the request is to redesign, refine, polish, de-slop, animate, create variations of, or design a screen, or when the user says a UI "looks AI-generated", "looks like a template" or "looks generic" (in Portuguese: "cara de IA", "des-ai-slopar", "parece template"). Works by asking before deciding, proposing a gray wireframe, implementing, and re-auditing its own result. Not for bugs, copy-only edits or product decisions without a screen.
---

# De-slop an interface

A "slop" screen looks assembled by someone who doesn't use the product: every block has the same weight, text explains what a drawing would show, actions repeat, and decoration says nothing. The goal is that every element exists for a reason the user can perceive.

## Language

The skill is written in English. Talk to the user in **their** language, including the names of the stages and the fixed sentences below (translate them; don't mix languages). Write product copy in the **project's** language, recorded in `profile.md`.

## When NOT to use

- **A bug or code behaviour.** Something breaks, doesn't respond or errors: that is a code task.
- **Copy alone.** Reviewing text without a screen.
- **A product decision without a screen.** "What to launch", "what price", "which feature".
- **Opinion or summary only.** If the user just wants an assessment, answer directly. Start the cycle only when they ask for a change.

When in doubt, ask what they want: a new screen, a redesign of an existing one, or only an assessment.

## Two directions

- **De-slop a screen that exists** (in the app, in Figma, or a prototype, including one this skill just built). The starting point is the current screen.
- **Create a new screen.** The starting point is the request and the ruler (the product's standard in `recipes.md`). If the user arrives with no brand, palette or components, follow *Arriving raw* first.

## Request size

Say which mode the request looks like and confirm with the user. Questions apply in all three.

| Mode | When | What runs |
|---|---|---|
| **Tweak** | One element or detail changes and the screen's organisation stays (a button, a label, a spacing) | Steps 1–3, then identify only that piece, ask, implement, run the *Redundancy test* and *Craft* on the piece, record the taste. No wireframe, variations, *Finish* or *Outside look* |
| **Screen** | One new or redesigned screen | The whole cycle, *Outside look* on a still screenshot |
| **Flow** | Several linked screens, with steps or branches | The whole cycle, *Outside look* on every path |

If a Tweak starts changing the organisation of the screen or touching another screen, stop, say so and move up to Screen. Between two modes, use the larger.

## The cycle

Within a mode, no step is skipped. The **Stop** lines are where you ask the user (see *Asking is the main thing*).

1. **Prepare the project.** Find the project files (see *Project files*). If they are missing, create them from `templates/` and tell the user. If the project already has screens or a ruler elsewhere (`DESIGN.md`, tokens in code), fill `recipes.md` from that and show it for confirmation. If there is nothing, follow *Arriving raw*.
2. **Read the taste.** Read `taste.md` (choices, rejections, exceptions) and `profile.md`.
3. **Open the ruler.** Read `recipes.md`. Derive components from it; invent only when it has nothing similar, and say what was invented. For app screens (table, metric, chart, chat, form, navigation, states) read `reference/components.md`. If the screen uses or asks for glass or blur, read `reference/glass.md`.
4. **Understand the role.** Follow *Screen role*.
   **Stop 1:** mode, direction (new or existing), and the role sentence.
5. **Identify.** Read `reference/audit.md` and `reference/ai-aesthetics.md`. On an existing screen, list each signal and point to where it is. On a new screen, say what it must solve, what the product already has for that, and what is missing. Show the list before proposing anything.
   **Stop 2:** intent (what the screen solves, when it is used, what bothers them, what cannot change, product decisions only they can make), and which signals to fix versus which are their taste. What is their taste becomes an exception in `taste.md`.
6. **Answer the priority questions** in `reference/audit.md`, in writing, for this screen. If an answer depends on a product decision, ask.
7. **Gray wireframe.** HTML skeletons with no colour and no brand font; two organisations when the direction is unclear. It is cheap to change here and expensive later.
   **Stop 3:** show the screenshot and ask which organisation to follow.
8. **Implement.** Ask once per project where the result goes and record it in `profile.md`: a self-contained HTML prototype (base64 images, real viewport, sample data coherent with the other screens) or the project's own code. Use the project's palette and recipes, and follow the chosen wireframe. A screen with states returns to its initial state on re-entry. Visual questions (colour, font, density, components, tone) are asked by showing, never only described.
9. **Variations**, only when the direction is unclear or the user asks. See `reference/craft.md`.
10. **Finish.** With structure and identity approved, follow *Finish* in `reference/craft.md`.
    **Stop 4:** the dose, seeing the screen with no finish, a light dose and a medium dose.
11. **Second check.** Run the skill again over the final version, in the de-slop direction, as if the screen were someone else's: audit signals, the `ai-aesthetics.md` checklist, *Redundancy test*, *Craft*, the *2-second test* and the role sentence. Compare with the ruler and list every deviation (colour, font, size, card, spacing, illustration). Leave out the exceptions recorded in `taste.md`. Your own design picks up slop without you noticing.
12. **Outside look.** Follow `reference/outside-look.md` and add its findings to the list.
    **Stop 5:** show the full list and ask what to fix before touching anything. A new function suggested by outside reviewers only enters if the user approves it.
13. **Fix and repeat when needed.** If colour, font, surface, structure or animation change after the last check, run the second check again before calling the screen done. Repeat the *Outside look* when the change may affect understanding.
14. **Report and record.** Say what the checks found and what changed. Whenever the user chooses, rejects or praises something, add a line to `taste.md`.
15. **Figma is optional.** Only when the user asks, and only after the HTML or code is approved.

Read `reference/motion.md` when the screen animates or the user asks for an effect, and `reference/copy.md` when writing or reviewing interface text.

## Asking is the main thing

The questions are what sets this skill apart. Never replace a question with an assumption.

- Use the agent's question tool when there is one, with concrete options and the recommended one first. Group the questions of a Stop into one call. Without a question tool, ask in a numbered list and wait for the answer before continuing.
- Do not re-ask what `taste.md` or `profile.md` already answers.
- **A visual question is shown, never only described:** colour and font applied to a real piece of the screen.
- **Something missing? Ask, don't invent.** A photo, a vector or icon, real data, a name, final copy, or an opinion only the user has. Do not fill in with a placeholder or a guess. If the user allows a provisional piece, mark it as provisional in the output and say what was left out.
- Before searching for references, ask the search scope (see `reference/inspiration-search.md`).
- If an answer opens a new doubt, ask again before going on.

## Screen role

Before auditing or drawing, find out why the screen exists and where it sits in the app. Do not fit it into a category: investigate with the user. A screen is not the sum of the actions that fit in it. The Home of a routine app may exist to welcome the person, even if a task can also be ticked there.

Ask, with concrete options:

- **Why does this screen exist?** What would the app lose without it?
- **Where is it in the flow?** Where does the person come from, what do they do here, where do they go next?
- **What must the person feel or understand in the first seconds?**
- **What changes when they come back tomorrow?**
- **Which task seems to belong here but lives elsewhere?**

Close it in one sentence and confirm it:

> This screen exists to ___. It is not the screen for ___.

No wireframe before this confirmation. Record the sentence in `taste.md`. If the reason for the screen changes later, go back to the structure.

**Having a reason is not having an action.** A screen that welcomes the person may have a shortcut, but the shortcut does not define the screen. A greeting is worth it when it carries real data ("2 plants to check today"); a greeting with no data is filler.

## Project files

Each project keeps its own data in **`<project>/.deslop/`**, never inside the skill folder:

| File | Holds | Template |
|---|---|---|
| `taste.md` | Choices, rejections, checklist exceptions, role sentences, references the user brought | `templates/taste.md` |
| `recipes.md` | The ruler: palette, fonts, surfaces, components, local rules | `templates/recipes.md` |
| `profile.md` | Starting preferences: product language, output target, font, icon and illustration stance, starting vetoes | `templates/profile.md` |

- Files in `templates/` are models. Never write in them; copy them.
- **First run in a project:** create `profile.md` by asking its questions (one grouped call). If the user says "use the defaults", copy the author defaults listed in the template.
- **Legacy projects:** if the project has `gosto.md` / `receitas.md` (in `.deslop/` or in `.claude/skills/deslop/`), they are the taste and the recipes. Use them as they are, in their own language, and do not rename or move them without asking. A file that still carries the template notice at the top is not project data.

**Order when they disagree:** `taste.md`, then `recipes.md`, then `profile.md`, then this skill and its checklists.

- **A recorded exception beats the checklist.** If `taste.md` approves a signal, do not report it and do not ask again, not even in the second check.
- **An exception has a scope.** Record the signal, where it applies and why. Outside that scope the signal counts again.
- **An exception never covers legibility.** Contrast, text size and reading are still checked.
- **Reopen only with a reason:** the user asks, or the *Outside look* shows a real usage problem. Then ask; do not remove it yourself.
- **The outside reviewer does not know the exceptions.** It stays without context; filter its answer afterwards.

## Arriving raw (no visual identity)

When the user wants to build from zero, with no brand, palette or components, the skill becomes an **investigation**: it helps the user direct their own ideas without deciding for them. Before any implementation, ask what the project is, whether any identity exists (palette, type, components, tone), what the screen must solve, what the product already has for it, and what is missing.

If there is no identity, help create one: palette, typography, components and tone coherent with the product. Use `reference/typography.md` for fonts and the *Identity* sources in `reference/sources.md` if the user asks for references, always as concept. Show an HTML demo of the ideas and let the user decide. They guide, you investigate.

When approved, write the identity to `recipes.md` and the choices to `taste.md`. Without that, the next screen starts from zero.

## Principles

- **Show instead of write.** State becomes colour, shape or position, not a paragraph.
- **One action, one place.** Filters live inside search; nothing duplicated.
- **The minimum per item.** Only what answers the item's question.
- **Hierarchy with few elements.** A big number only where it is the news. A one-line greeting with real data under it.
- **Depth with one recipe.** One consistent surface; shadow only on what floats.
- **Colour with meaning.** A gradient only when it tells something or gives volume.
- **The state chooses the action.** Never two equivalent buttons side by side.
- **Status is text, not a control.** "On" in green, never a decorative switch.
- **Consistency across screens.** Before inventing a component, reuse the one from another screen. A new symbol only enters when no existing one says it, and then it holds everywhere.
- **Icons and illustration follow `profile.md`.** Whatever the choice, never a generic AI icon (✦, sparkles, wand) standing for a function, and one stroke, weight, corner and grid across the product.
- **Very empty screens.** Suggest ideas to fill them (an animation, a card). Do not implement without permission.

When justifying a decision, cite the foundation: recognition over recall, aesthetic and minimalist design, and visibility of system status (Nielsen #6, #8, #1); data-ink ratio (Tufte); signifiers (Norman); proximity and common region (Gestalt); Hick's law and the Von Restorff effect (one main action per state); "Don't make me think" (Krug).

## When a tool is missing

| Missing | Do this instead |
|---|---|
| Question tool | Ask in a numbered list in chat and wait. Never skip a Stop |
| Subagent, or a second model | Run the *Outside look* yourself from the screenshot alone, in a fresh pass without re-reading the code, and tell the user it was not independent. Offer the user the two questions to answer themselves |
| Browser or screenshot tool | Ask the user for a screenshot. For references, use the bundled `inspiration/` collection and say so |
| Image generation | Draw the illustration as SVG, or ask the user for the asset |

## File map

| File | Read when |
|---|---|
| `reference/audit.md` | Identifying (step 5), priority questions (6), second check (11) |
| `reference/ai-aesthetics.md` | Every screen, old or new: the 12-signal visual checklist |
| `reference/catalog.md` | A signal is not in the checklist, or a deeper review is asked (80+ patterns) |
| `reference/gallery.html` | The user wants to see a signal: slop × fix pairs, rendered |
| `reference/slop-examples/` | Real screenshots of the look to avoid |
| `reference/craft.md` | Implementing, variations, finish, second check |
| `reference/motion.md` | The screen animates, or a thematic effect is on the table |
| `reference/copy.md` | Writing or reviewing interface text; per-language AI tells |
| `reference/components.md` | App screens: table, metric, chart, agent UI, form, navigation, states |
| `reference/typography.md` | Choosing or reviewing a font |
| `reference/glass.md` | Glass or blur |
| `reference/outside-look.md` | Step 12 |
| `reference/inspiration-search.md`, `reference/sources.md` | Only when the user asks for inspiration or references |
| `inspiration/` | Bundled good references, the fallback when browsing is unavailable |

## Deliverables

At the end of a cycle, deliver and check nothing was left out. In Tweak mode the list of fixes and the updated `taste.md` are enough.

- **Screen role:** the sentence confirmed with the user.
- **Audit:** the signals found, each pointed to in place.
- **Gray wireframe:** the approved skeleton(s).
- **Implementation:** the HTML prototype or the project code, with its states.
- **List of fixes:** what the second check and the outside look found and changed.
- **Updated `taste.md`:** new choices, rejections and references.
- **Figma (optional):** only when asked, after approval.

---

Made by [Guto](https://byguto.com) · [@henrik404](https://x.com/henrik404)
