import { pathToFileURL } from "node:url";
import { renderTerminalArt } from "./ui/terminal-art.mjs";
import { CREATE_ACCOUNT, selectAccountMenu } from "./users/account-selector.mjs";

const HELP = `Usage: node scripts/preview-terminal-art.mjs --label <name> [--width N --height N --no-color]
       node scripts/preview-terminal-art.mjs --select [--width N --height N --no-color]

--select opens the real account-picker UI with synthetic Evolvera/Pessoal choices only.`;

function parseArgs(args) {
  const options = { width: process.stdout.columns || 80, height: process.stdout.rows || 24, color: process.env.NO_COLOR === undefined && process.env.TERM !== "dumb" };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    if (arg === "--select") { if (options.select) throw new Error("--select may be specified once"); options.select = true; continue; }
    if (arg === "--no-color") { options.color = false; continue; }
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

export async function main(args = process.argv.slice(2), { input = process.stdin, output = process.stdout } = {}) {
  let options;
  try { options = parseArgs(args); }
  catch (error) { output.write(`${error.message}\n${HELP}\n`); return 2; }
  if (options.help) { output.write(`${HELP}\n`); return 0; }
  let label = options.label ?? "";
  if (options.select) {
    if (!input.isTTY || !output.isTTY) { output.write("--select requires an interactive TTY\n"); return 2; }
    const selected = await selectAccountMenu({
      users: [{ id: "evolvera", label: "Evolvera" }, { id: "pessoal", label: "Pessoal" }], input, output, color: options.color,
    });
    if (selected === null) { output.write("Synthetic preview selection cancelled. No account or session was accessed.\n"); return 0; }
    label = selected === CREATE_ACCOUNT ? "" : selected === "evolvera" ? "Evolvera" : "Pessoal";
    const description = selected === CREATE_ACCOUNT ? "Create new account menu item" : `selected ${label}`;
    output.write(`Synthetic preview only — ${description}; no account or session was accessed.\n`);
  }
  output.write(`${renderTerminalArt({ width: options.width, height: options.height, label, color: options.color }).join("\n")}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
