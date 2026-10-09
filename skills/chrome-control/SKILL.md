---
name: chrome-control
description: Use PI's isolated Chrome MCP tools for browser research, QA/E2E, and debugging; manage PI-owned Chrome profiles without touching real Chrome profiles.
---

# Chrome control via MCP

Use the `playwright` MCP server for isolated, headless Chrome by default. Use it for page snapshots/accessibility, screenshots of the actual rendered page, DOM inspection, coordinate-based vision, mouse/keyboard input, forms and file upload, tabs/navigation, console/network inspection, JavaScript evaluation, performance tracing, and viewport/device emulation. The PI config pins `@playwright/mcp@0.0.83`; the `vision` and `devtools` capabilities are enabled. The server starts lazily and uses an isolated temporary browser profile.

## Persistent PI profiles

Use the `chrome_profile_manager` tool when a task needs separate persistent browser state:

1. `list` shows names from the real Chrome `Local State` file read-only and PI-owned profiles under `~/.pi/chrome-profiles/`.
2. `create` makes a new, empty PI-owned profile. Existing directories are never adopted or overwritten.
3. `start` or `switch` starts Chrome against that PI profile on an available debugging port bound to `127.0.0.1`, then registers a session MCP server named `chrome_live_<profile>` using the same pinned Playwright MCP version. The default is headless so it does not take desktop focus. Use headless false only when a headed window is specifically needed; Chrome starts minimized so the user can open that isolated window manually without the automation moving desktop focus.
4. `status` reports the managed instance. `stop` disconnects the matching MCP server and closes only the Chrome child launched by this extension. Session shutdown also stops managed instances.

A PI profile is an empty directory; sign in to a PI profile yourself in its own browser session if needed. Never copy cookies, passwords, sessions, or any other data from real Chrome profiles. Real profile names are metadata only: do not launch them or treat their names as permission to access their data. The manager does not attach to regular Chrome.

## Safety

- All browser interaction must use MCP/Chrome DevTools Protocol tools. Never use OS mouse/keyboard automation, accessibility automation of desktop controls, or cursor/focus manipulation.
- Never connect to the user's regular Chrome, its user-data directory, or a non-loopback debugging endpoint. Do not kill a Chrome process unless this manager launched that exact child; never use process-name matching.
- Browser pages may contain personal or confidential data. Do not expose sensitive page content in reports or screenshots.
- Do not submit purchases, send messages, publish, or perform other consequential actions without the user's explicit approval.
- Prefer disposable test pages/data for QA. Stop only PI-managed Chrome instances when finished; don't delete profile data as cleanup.
