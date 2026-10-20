# Intro Artwork — Acid Shellscape

The introduction combines an enlarged sunset landscape, an animated layered reveal, and a profile selector inspired by video game screens. After the introduction, the scene stays alive: glow, clouds, waves, and reflections move continuously. For the Evolvera profile, the former logo landmark is replaced by a Japanese ship with the brand on its flag.

## Composition and identity

- Subtle bands of purple, lilac, and coral sky, a sun with a dotted halo, three mountain layers, and a reflection on the water. No blur or soft gradients.
- Color fields use ANSI background spaces; half-blocks preserve the terminal cell's 1:2 aspect ratio. Textures are stable by coordinate, with no per-frame RNG.
- The ship is a pixel-art interpretation of the user's reference: a wide hull, enclosed galleries, a raised cabin with a Japanese-style roof, masts, and many golden oars. It is not a generic sailboat.
- The light-colored flag carries Evolvera's official 40×34-pixel mask, resampled to the fabric and deformed with it. There is no Japanese flag or oversized logo separate from the ship. The hull rocks, the oars move in a coordinated cycle, and the flag waves.
- **The custom artwork contains no PI logo or text.** The SDK's small native header remains PI's own and is not replaced by this integration.
- The **ship + Evolvera flag** appear only when the account's **display name** is a string whose `trim().toLowerCase()` is `evolvera`. There is no fallback to ID, provider, system username, or names such as `Evolvera Labs`.
- Other users see the animated landscape without the ship or branding. In the selector, the highlighted account determines the composition; “Create new account” does not get the ship.

The reference is Kevin's private **Acid Shellscape**, commit
`9075be47288d4b85a9eadb59234cbc769a02e130`: README, tokens, and sunset-theme image.
The implementation is a native translation into terminal cells, not an embedded Canvas. The private source remains © Kevin; its complete code and screenshots are not vendored and this translation grants no new license.
The brand geometry comes from <https://evolvera.com.br/logo.svg>.
No remote image, font, or asset is downloaded at runtime.

## Rendering and sizing

`scripts/ui/terminal-art.mjs` is the composition authority. Ship geometry is in
`scripts/ui/terminal-art-ship.mjs`, and the official flag mask is in
`scripts/ui/terminal-art-masks.mjs`:

```js
renderTerminalArt({ width = 80, height = 24, label = '', color = true, progress = 1, timeMs = 0 } = {}) // string[]
isEvolveraLabel(label) // boolean
```

The renderer is pure: no clock, timers, environment, I/O, or external randomness.
`progress` ranges from 0 to 1 and reveals the composition once. `timeMs` determines the ambient phase in a consistent 24-second cycle; invalid values become zero, and very large finite values are reduced before calculations. The introduction does not restart each cycle. Patterns and mountains remain stable, without changing the random seed per frame. All frames keep the same row/column budget. Finite dimensions are rounded down and capped at **240 columns × 40 rows**; invalid or non-positive dimensions do not allocate a scene. Small surfaces retain a proportional landscape and omit the ship when it would not be legible. ANSI uses SGR only, with a reset at the end of each line; `color: false` retains a monochrome scene without escapes.

The selector has one shared budget for the scene, frame, help, and up to five visible options, with scrolling. With two profiles and the create-account option, the scene gets **17 of 24 rows** or **29 of 36 rows**. A blank row separates the scene from the login header without shrinking the artwork or exceeding the viewport. The frame is centered, the selected profile has a highlighted fill, and a counter shows its position in the list. ID and name are not repeated when they are equivalent ignoring case. In small windows, the frame/landscape yield space to the list and controls.

In the TUI, artwork height is the smallest of 36, half the terminal's rows, and the rows available after reserving 10 for the interface. For example, a 40-row terminal gets a 20-row scene. **Do not use the entire terminal area for the widget:** that can leave only the last line of a notification visible. The notification list remains in the native chat above the artwork; it is not cleared or turned into artwork. Font choice remains with the emulator; this integration does not install fonts.

## Motion and lifecycle

`scripts/ui/terminal-art-animation.mjs` is the sole timing authority. The reveal lasts about **1.5 s at 12 frames/s**: sky, light/clouds, mountains, water, and ship. Afterward, the same timer continues emitting `(progress: 1, elapsedMs)` for ambient motion; there is no second mechanism or repeated introduction. The clock can be injected in tests. Rendering runs continuously while the scene is open; this is intentional and can cost more in large/remote terminals. Animation ends only when leaving the screen, starting the conversation, closing the output, or choosing the static version.

The selector accepts keyboard input from the first frame. Changing the selection updates the branding at the current progress without restarting the animation on every arrow key. Resizing preserves the selection. Exit, cancellation, closure, and failures stop owned timers/listeners and restore the entry state.

`scripts/ui/terminal-art-output.mjs` is the selector and standalone preview's only direct animated output. It uses an alternate-screen viewport and absolute coordinates, with explicit CR and a safety column against autowrap. Each update is one synchronized write, containing only changed lines and padding them to width: it does not clear a line before repainting, emit LF, or rewrite the static HUD. Initial clearing does not repeat each frame. On exit, it restores the main screen when output is still available.

If `write()` returns `false`, it stores only the latest request and does not generate intermediate frames. `drain` paints the current state without replaying a queue of old frames; the keyboard continues updating selection while output is waiting. The renderer also reuses independent ANSI foreground/background values without changing pixels and avoids repeating constant calculations inside the pixel loop.

The `scripts/users/startup-art.mjs` factory is registered by the managed runtime with the account name and root `sessionManager`. It uses the public `aboveEditor` widget, after chat/notifications and before the editor. Frames request a TUI redraw without writing directly to stdout. `input`, `before_agent_start`, shutdown, and dispose stop motion; the start of the conversation removes the widget. **Esc also hides the initial artwork without sending a message**, releases the keyboard listener, and preserves the key's native behavior. It does not reappear in `/new`, `/reload`, a fork, or a session switch. It adds no messages to history or model context. RPC, print, and non-root-TUI sessions do not receive the artwork. `--no-extensions` continues to disable this internal extension.

`NO_COLOR` (including an empty value) disables colors. `TERM=dumb` also disables motion. `--no-animation` in the preview shows the final frame immediately. Redirected output produces only one final frame, without cursor controls or animation delays.

## Preview without installing

Run from the root of this branch:

```sh
# Real selector, but only with synthetic Evolvera/Pessoal profiles.
node scripts/preview-terminal-art.mjs --select

# Continuous scene with ship / continuous landscape without ship. Ctrl+C exits.
node scripts/preview-terminal-art.mjs --label Evolvera
node scripts/preview-terminal-art.mjs --label Pessoal

# Explicit-size sample, without motion.
node scripts/preview-terminal-art.mjs --label Evolvera --width 120 --height 28 --no-animation

# Monochrome, without motion.
node scripts/preview-terminal-art.mjs --select --no-color --no-animation
```

`--select` uses the terminal's actual dimensions; `--width` and `--height` size standalone samples, always capped to the current viewport. Animation uses the alternate screen: it does not overwrite the main screen's previous contents and restores them on exit. `--no-animation` prints a static scene that stays on the main screen. With `--label`, the scene stays open until Ctrl+C (exit 130), SIGTERM (143), or output failure; it does not exit automatically after the introduction. With `--select`, choosing/canceling stops the timer. The CLI releases its stdin listener when done.
The preview does not read the registry, credentials, or history, create accounts, or open a PI session. “Create new account” is only a visual option in this preview.

## Validation and limitations

```sh
node --test --test-concurrency=5 scripts/test/terminal-art.test.mjs scripts/test/account-selector.test.mjs scripts/test/startup-art.test.mjs scripts/test/terminal-art-animation.test.mjs scripts/test/terminal-art-output.test.mjs
```

The **54 focused tests** passed in approximately **1.14 s**, with five workers and process isolation per file on a machine with 12 logical CPUs. They use in-memory streams/clocks and source reading: `NO_STATEFUL_RESOURCES`. They cover geometry, identity, continuous motion, Unicode, navigation, backpressure, resize, static mode, real `Writable`/EPIPE callbacks, and signals.

An independent comparison with the previous renderer checked **180 color cases, 529,230 cells**, plus monochrome versions, with no glyph or RGB differences. In a 48-frame microbenchmark at 120×33, serialization dropped from 48,836 to 34,644 bytes/frame (**29% less**); the pure renderer median fell from 3.76 to 2.47 ms. This does not measure emulator graphics latency.

Under congested output, 120 ticks generated or wrote no additional frames: only the first write remained pending, instead of the previous replay's approximately 2.4 MB. The test releases `drain`, checks only the latest state, and confirms selection/cancellation remain available.

Real Linux PTYs, with ONLCR disabled, exercised the selector, resize, continuous scene, and static scene. Arrow keys updated the highlight in approximately 13–14 ms; selection took approximately 9 ms. Ctrl+C ended the continuous scene with code 130. Replaying the bytes in xterm-headless confirmed zero scrolling on the alternate screen, restoration of the main contents, and persistence of the static scene.

The **1.3.0/Linux** SDK was also opened in 100×36 PTYs with synthetic EVOLVERA/Pessoal profiles and dedicated HOME, agentDir, registry, stage, cache, and sessions in `mkdtemp`. With no credentials, tools, or MCP, and with fetch/sockets blocked, both exited with code 0 in approximately 6.2 s, with no network attempt. Notifications remained above the scene, and the first input removed the artwork. The SDK was neither patched nor installed; checked entrypoint hashes remained unchanged. No test process remained active.

The Esc regression was observed in the real TUI with an unsent draft: the artwork disappeared, while the draft and notifications remained visible, without sending a message or accessing providers. The real registry and SDK entrypoint fingerprints remained unchanged; the test used only an isolated synthetic registry.

The validation above observes protocol, cells, and PTY behavior, not a graphical Orca screenshot. Windows, macOS, other SDKs/fonts/emulators, and provider calls were not exercised. The 0.83.0 baseline still cited in the README was not validated. PR and merge remain subject to later user approval.
