# Audit: signals, tests and priority questions

Used when identifying (step 5), answering the priority questions (step 6) and in the second check (step 11). Skip anything recorded under *Checklist exceptions* in the project's `taste.md`.

## Signals of slop

Point to each one in place, on the screen.

- Full-width cards stacked, all with the same visual weight.
- The same action repeated on every row (one button per item).
- The same action in two places on the screen.
- A generic AI icon (✦, sparkles, wand) standing for a function.
- Microcopy that explains the obvious or repeats the same sentence on every item.
- Structured data written as a sentence ("Surface: moist. Middle: moist. Bottom: dry.").
- Filler text: a date above the greeting, titles that break into two lines, truncated labels.
- A generic list with a 1 px divider as its only structure.
- A control that controls nothing: a switch showing a state, a "group" pill with no function.
- A highlight button too big for a secondary action.
- A label that repeats the drawing, or a card title that repeats the content.
- An obvious explanation of where the data came from ("you counted"); the origin becomes an icon or a style.
- Two actions with the same weight when the state already decides which one makes sense.
- **AI aesthetics:** beyond content, go through `ai-aesthetics.md` (signal, signature CSS, fix, when it is legitimate). For other patterns use `catalog.md`. `gallery.html` shows the main ones as slop → fix pairs, and `slop-examples/` has real screenshots.

## Redundancy test

For each piece of text on the screen, ask: does a drawing, an icon, the position or another text already say this? If so, the text goes.

Then the opposite: could any remaining text become a visual element? A date becomes a point on a line, a comparison becomes bars, a state becomes colour or shape, a list of parts becomes a layered drawing. Swap when the visual says the same with less reading; keep the text only when it carries exact data the visual does not show (a number, a name).

## Priority questions

After the *Screen role*, answer in writing, for this screen, before drawing. If an answer depends on a product decision, ask instead of assuming. In the second check, confirm the design delivers.

1. **What kind of visit is this?** Transient (open, resolve, leave) or sovereign (stay and explore)? Transient screens need almost nothing beyond the answer and the action.
2. **What does the person want?** "When ___, I want ___, so that ___". If the "so that" is circular, the sentence is wrong. Think of the goal, not the task.
3. **How do they understand the state without reading?** Which attribute perceived before reading (colour, shape, position, movement) answers the main question in under a second?
4. **Does the reason for the screen call for an action? If so, which single one does this state call for?** It is prominent, easy to reach (on a phone, within thumb reach) and only appears when it makes sense. On a screen that welcomes the person it may be just a shortcut, or not exist.
5. **In what order does the rest come?** Overview, then the why, then details on demand.
6. **What can stay in the periphery?** When all is well the screen is calm. When something needs attention it rises to the centre.
7. **Which actions are steps of the same task?** Think of the flow, not the still screen: what does the person do before and after? Actions that always happen in sequence become one button with steps.

### Screen states

List the states that change what the screen shows and check the hierarchy of each. Draw the main states and only the others that truly change the screen.

### 2-second test

If the person saw the screen for 2 seconds, would they know the state and what to do? This is a house rule: on transient screens the answer cannot depend on reading a sentence.
