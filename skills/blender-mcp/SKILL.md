---
name: blender-mcp
description: Bring up, repair, or use the Blender MCP integration. Use when the user asks to set up or fix Blender in PI, or to inspect, model, light, render, or import assets in a running Blender session through MCP.
---

# Blender MCP

The integration is four links in a chain. Diagnose top-down and stop at the first broken link; fixing a
later link never repairs an earlier one, and every claim of success must survive the verification step
in the section that changed.

| # | Link | Verify with |
|---|---|---|
| 1 | PI knows the server | `pi mcp list` lists `blender: connected, 9 tools` |
| 2 | `uvx` resolves on `PATH` | `command -v uvx` |
| 3 | The Blender addon is installed **and enabled** | the socket check in §2, or the headless probe |
| 4 | The addon's socket is listening | `ss -ltn \| grep 9876` (Linux), `lsof -nP -iTCP:9876 -sTCP:LISTEN` (macOS), `Get-NetTCPConnection -LocalPort 9876` (Windows) |

`config/mcp.json` in this repository ships link 1; the rest live on the machine and no installer creates
them. The entry is:

```json
{ "command": "uvx", "args": ["mcp-for-blender"] }
```

Upstream is [ahujasid/mcp-for-blender](https://github.com/ahujasid/mcp-for-blender) — third-party, MIT, not
from the Blender Foundation. `uvx blender-mcp` still resolves for older setups; prefer `mcp-for-blender`.

## 1. Confirm PI's side

```bash
pi mcp list
```

- `connected, 9 tools` — link 1 is done, go to §2.
- `failed ... spawn uvx ENOENT` — link 2: install `uv` (`curl -LsSf https://astral.sh/uv/install.sh | sh`,
  or `winget install --id=astral-sh.uv -e` on Windows), open a new shell, recheck.
- The server is missing from the list entirely — the runtime `mcp.json` predates the entry (the installer
  never replaces an existing file). Add the entry to `~/.pi/agent/mcp.json`, then `/reload` or restart the
  session. Editing it with `pi mcp add blender -- uvx mcp-for-blender` writes the same thing.

Inside a session, `/mcp` shows the same state plus the tail of the server's stderr.

## 2. Bring Blender's side up

Order matters: `uv` first, then the addon, then a GUI session.

```bash
command -v blender && blender --version    # native install
flatpak list | grep -i blender             # or a Flatpak install
uvx mcp-for-blender setup --dry-run        # inspect what it would change
uvx mcp-for-blender setup                  # install AND enable the addon
```

`setup` installs the addon, enables it, and rewrites MCP client configs for other hosts (Claude Desktop, Claude Code, Codex, Cursor, OpenCode, Antigravity). It does not configure PI: `setup --dry-run` lists those hosts and never mentions PI, and `~/.pi/agent/mcp.json` stays byte-identical. Use `--skip-addon` when only the client configs should change.

**Flatpak caution.** `setup` and `install-addon` target `~/.config/blender/<version>/scripts/addons` on Linux. A Flatpak Blender reads its config from the sandbox mapping instead — `~/.var/app/org.blender.Blender/config/blender/<version>/scripts/addons` — so on those systems the automatic path writes an addon copy nothing loads, and `uvx mcp-for-blender addon-paths` reports no directories at all. Point the install at the real directory:

```bash
uvx mcp-for-blender install-addon --addons-dir "$HOME/.var/app/org.blender.Blender/config/blender/VER/scripts/addons"
```

Replace `VER` with the version directory present on the machine. `BLENDERMCP_ADDONS_DIR` overrides the destination as well. `install-addon` only copies the file; enabling is a separate step under `Edit → Preferences → Add-ons → Interface: MCP for Blender`.

Verify enablement without a GUI session:

```bash
flatpak run org.blender.Blender --background --python-expr "import bpy; print(sorted(bpy.context.preferences.addons.keys()))"
# native: blender --background --python-expr "import bpy; print(sorted(bpy.context.preferences.addons.keys()))"
```

`blender_mcp` in that list means it is enabled. `BlenderMCP addon registered` in a log comes from `register()`, so it proves the addon loaded and is enabled — it says nothing about the socket.

### The socket only opens with a GUI session

`_blendermcp_ensure_server_running()` in the addon returns early when `bpy.app.background` is set, and
`start()` refuses background mode outright, because commands queued to a headless instance would never run.
`blender --background` therefore never opens port 9876. The user opens Blender normally; with
`Auto-Start Server` on (the default) the socket comes up within seconds. Headless automation needs a
virtual display, for example `xvfb-run -a blender`.

Then:

```bash
ss -ltn | grep 9876 || echo "socket closed"
```

`0.0.0.0:9876` and `127.0.0.1:9876` both mean the addon is up. Closed means the addon is disabled, the
panel's server was stopped, or Blender is not running.

## 3. Work through the tools

`pi mcp list` reports these, and the adapter exposes them through the `mcp` proxy tool:

| Tool | Use |
|---|---|
| `get_scene_info` | Compact scene summary; start here to see what exists |
| `look` | Visual verification: `viewport`, `camera`, `angles` (multi-view sheet), `frames` (animation strip), in `solid`, `material`, `rendered`, `wireframe`, or `xray` |
| `execute_blender_code` | Arbitrary Blender Python; the real workhorse |
| `search_assets` / `import_asset` | Poly Haven HDRIs, textures, models; Sketchfab; Poly Pizza |
| `generate_3d` | Generate and import a model (Tripo, Hunyuan3D, Hyper3D Rodin, Meshy) |
| `get_addon_status` | Blender version, addon version, enabled libraries and generators |
| `disable_telemetry`, `record_trajectory_feedback` | Data collection controls |

Discipline that prevents most wasted turns:

1. `get_scene_info` before changing anything; the scene the user has open is not the default one.
2. Change in small `execute_blender_code` steps, not one large script; a failed step then has a narrow cause.
3. `look` after geometry or lighting changes; a render is the only proof the result looks right.
4. Poly Pizza credits are required for CC-BY models; the importer writes `polypizza_attribution` onto the
   object, so keep it.
5. Prefer 1k or 2k Poly Haven resolutions; downloads block Blender's main thread and the UI freezes.

## Security and limits

- `execute_blender_code` runs arbitrary Python in the user's Blender process. Save the file first, and never
  run code whose effect the user has not asked for.
- The addon's socket has **no authentication and no encryption**. Anyone who can reach port 9876 can run
  Python in Blender. Keep it on `localhost`; use an SSH tunnel instead of binding a LAN address.
- `"env": { "BLENDER_MCP_SAFE_MODE": "1" }` on the server entry validates scripts before execution and
  blocks file, process, and network access. `"DISABLE_TELEMETRY": "true"` turns off the anonymous usage record.
- One server process per port. A second Blender instance needs `--port 9877` in the entry's `args` and the
  same port in its addon panel.
- The server speaks MCP over stdio, so the client spawns it. Running `uvx mcp-for-blender` in a terminal
  produces a process nothing is talking to; it is not a health check. Use `pi mcp list` instead.

## Failure signatures

| Symptom | Cause | Action |
|---|---|---|
| `spawn uvx ENOENT` | `uv` missing or not on the client's `PATH` | §1; on Windows give the absolute `uvx.exe` path |
| Connected, but calls fail with `Connection refused` | Blender closed, addon disabled, or server stopped in the panel | §2 |
| `addon-paths` finds no directories | Flatpak or unusual layout | `--addons-dir` or install from Preferences |
| Port listening, tools still error | Two servers bound to one port, or a stale process owning 9876 | One server per port; check `ss -ltn` |
| Entry absent from `/mcp` | Session started before the config was written | `/reload` |
| Tools work in `pi mcp list` but not in session | Adapter loaded config before it changed | `/reload` |
