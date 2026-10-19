import { pathToFileURL } from "node:url";
import { renderTerminalArt } from "./ui/terminal-art.mjs";
import { startArtAnimation } from "./ui/terminal-art-animation.mjs";
import { CREATE_ACCOUNT, selectAccountMenu } from "./users/account-selector.mjs";

const HELP = `Usage: node scripts/preview-terminal-art.mjs --label <name> [--width N --height N --no-color --no-animation]
       node scripts/preview-terminal-art.mjs --select [--no-color --no-animation]

--select opens the real account-picker UI at the terminal size, with synthetic Evolvera/Pessoal choices only.
--width and --height size standalone scenes; --no-animation renders the final scene immediately. Press Ctrl+C to exit an animated scene.`;

function parseArgs(args, output) {
  const options = { width: output.columns || 80, height: Math.min(36, Math.max(1, (output.rows || 24) - 8)), color: process.env.NO_COLOR === undefined && process.env.TERM !== "dumb", animate: true };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    if (arg === "--select") { if (options.select) throw new Error("--select may be specified once"); options.select = true; continue; }
    if (arg === "--no-color") { options.color = false; continue; }
    if (arg === "--no-animation") { options.animate = false; continue; }
    if (arg === "--label" || arg === "--width" || arg === "--height") {
      const value = args[++i];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      if (arg === "--label") options.label = value;
      else {
        const number = Number(value);
        if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${arg} must be a positive integer`);
        options[arg.slice(2)] = number;
      }
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.help && Boolean(options.select) === (options.label !== undefined)) throw new Error("provide exactly one of --label or --select");
  return options;
}

export async function main(args = process.argv.slice(2), { input = process.stdin, output = process.stdout, animationClock } = {}) {
  let options;
  try { options = parseArgs(args, output); }
  catch (error) { output.write(`${error.message}\n${HELP}\n`); return 2; }
  if (options.help) { output.write(`${HELP}\n`); return 0; }
  let label = options.label ?? "";
  if (options.select) {
    if (!input.isTTY || !output.isTTY) { output.write("--select requires an interactive TTY\n"); return 2; }
    const selected = await selectAccountMenu({
      users: [{ id: "evolvera", label: "Evolvera" }, { id: "pessoal", label: "Pessoal" }], input, output, color: options.color, animate: options.animate && output.isTTY,
    });
    if (selected === null) { output.write("Synthetic preview selection cancelled. No account or session was accessed.\n"); return 0; }
    label = selected === CREATE_ACCOUNT ? "" : selected === "evolvera" ? "Evolvera" : "Pessoal";
    const description = selected === CREATE_ACCOUNT ? "Create new account menu item" : `selected ${label}`;
    output.write(`Synthetic preview only — ${description}; no account or session was accessed.\n`);
    return 0;
  }
  const width = output.isTTY ? Math.max(1, Math.min(options.width, output.columns || options.width)) : options.width;
  const height = output.isTTY ? Math.max(1, Math.min(options.height, Math.max(1, (output.rows || options.height) - 1))) : options.height;
  const draw = (progress, timeMs = 0) => renderTerminalArt({ width, height, label, color: options.color, progress, timeMs });
  if (!options.animate || !output.isTTY || process.env.TERM === "dumb") {
    output.write(`${draw(1).join("\n")}\n`);
    return 0;
  }
  const drawFrame = (progress, elapsedMs) => draw(progress, elapsedMs);
  const animationResult = await new Promise((resolve, reject) => {
    let settled = false;
    let stop;
    let paintedRows = 0;
    const finish = (error, signal) => {
      if (settled) return;
      settled = true;
      process.removeListener("SIGINT", onInterrupt);
      process.removeListener("SIGTERM", onTerminate);
      output.off?.("error", onOutputError);
      output.off?.("close", onOutputClose);
      try { stop?.(); } catch (stopError) { error ??= stopError; }
      if (signal) { resolve(signal === "SIGINT" ? 130 : 143); return; }
      if (error) reject(error);
      else resolve(0);
    };
    const writeFrame = (progress, elapsedMs) => {
      if (settled) return;
      const lines = drawFrame(progress, elapsedMs);
      if (paintedRows) output.write(`\u001b[${paintedRows}A\r`);
      for (const line of lines) {
        if (settled) break;
        output.write(`\u001b[2K${line}\r\n`);
      }
      paintedRows = lines.length;
    };
    const onInterrupt = () => finish(undefined, "SIGINT");
    const onTerminate = () => finish(undefined, "SIGTERM");
    const onOutputError = (error) => finish(error);
    const onOutputClose = () => finish(new Error("Preview output closed during animation"));
    process.once("SIGINT", onInterrupt);
    process.once("SIGTERM", onTerminate);
    output.once?.("error", onOutputError);
    output.once?.("close", onOutputClose);
    try {
      stop = startArtAnimation({
        onFrame(progress, elapsedMs) { writeFrame(progress, elapsedMs); },
        onError(error) { finish(error); },
        clock: animationClock,
      });
      // A stream may emit an error synchronously while writing the initial frame.
      if (settled) stop();
    } catch (error) { finish(error); }
  });
  return animationResult;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main();
  } finally {
    // This standalone CLI owns stdin; the shared picker leaves it reusable.
    process.stdin.pause();
  }
}
