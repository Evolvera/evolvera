# Outside look

Whoever drew the screen knows what each element means and never finds anything confusing (the curse of knowledge). On the final version, after the *Finish* and the second check, ask for the analysis of an agent with no context.

1. **Take a screenshot of the screen**, with no notes. Any screenshot tool works. With headless Chrome: `chrome --headless=new --force-device-scale-factor=2 --window-size=470,910 --virtual-time-budget=6000 --screenshot=<file>.png <url>` (use the full path to the Chrome or Chromium binary when `chrome` is not on the PATH). Also make a small or slightly blurred version.
2. **Call a new agent**, never a copy of this conversation, on a different model when one is available. Hand over only the image paths and one line about the product. Never the code, the class names or the intentions.
3. **Always start with the same question:** "Look at the small version and say, in one sentence, your first impression." Only then show the sharp one.
4. **Write the other questions for this screen**, from the *Priority questions* in `audit.md`, without giving away the answer. Always ask "what is this screen for?". Also ask what was confusing and what they saw first.
5. **Compare** the answers with the *Screen role* sentence, with the job story, and with answers 3 and 4 of the priority questions. Where they diverge, the design failed, not the reader.

If no subagent is available, see *When a tool is missing* in `SKILL.md`, and tell the user the look was not independent.

## Flows: every path

When the screen is a flow with steps and branches, a still screenshot is not enough. List every path, capture each one step by step (a script that taps in order and screenshots after each step, with an `index.json`), and run **one new agent per path** (never per step), asking for a table per step (what it communicates, the expected next tap, surprises) and the problems by severity.

## Rounds

After fixing, run again with **new** agents: an agent that saw the previous version reads the new one with the answers in its head. **By default, one round.** More (up to three) only when the user asks or when the fix changes the flow or the understanding of the screen. The agent judges **clarity** well and **beauty** badly; beauty is decided by the user, with *Variations* and `taste.md`.
