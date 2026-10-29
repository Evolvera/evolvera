#!/usr/bin/env node
/**
 * Garante que o PI ache o Git Bash no Windows.
 *
 * Por quê: o PI procura o Git Bash só em %ProgramFiles%\Git e %ProgramFiles(x86)%\Git. Com o Git instalado em outro
 * lugar (D:\Program Files\Git, por exemplo), ele cai no primeiro bash.exe do PATH, que em muitos PCs é o lançador do
 * WSL (C:\Windows\System32\bash.exe). Sem uma distribuição Linux, todo comando do PI falha com
 * "execvpe(/bin/bash) failed", inclusive nas sessões abertas pelo PI Studio e no `pi` aberto pelo PowerShell.
 *
 * O que faz: se settings.json não tem shellPath e o Git Bash não está onde o PI procura, grava em shellPath o
 * bin\bash.exe da instalação do git.exe do PATH. Nunca troca um shellPath que a pessoa escolheu. Fora do Windows, nada.
 *
 * Uso: node scripts/set-shell-path.mjs <pasta do PI>   (padrão ~/.pi/agent)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Onde o PI procura o Git Bash sozinho (mesma ordem de utils/shell.js do PI).
export function defaultBashPaths(env = process.env) {
  return [env.ProgramFiles, env['ProgramFiles(x86)']].filter(Boolean).map((root) => path.win32.join(root, 'Git', 'bin', 'bash.exe'));
}

// Onde pode estar o bin\bash.exe da instalação do Git deste git.exe: <Git>\cmd\git.exe, <Git>\bin\git.exe e
// <Git>\mingw64\bin\git.exe (o primeiro do PATH dentro do Git Bash) sobem até a raiz do Git em dois ou três níveis.
export function gitBashFor(gitExe) {
  if (!gitExe) return [];
  const candidates = [];
  let dir = path.win32.dirname(gitExe);
  for (let level = 0; level < 3; level++) {
    dir = path.win32.dirname(dir);
    candidates.push(path.win32.join(dir, 'bin', 'bash.exe'));
  }
  return candidates;
}

// O shellPath a gravar, ou null quando não há nada a fazer.
export function shellPathToSet({ settings, platform = process.platform, env = process.env, exists = existsSync, gitExes = [] }) {
  if (platform !== 'win32' || settings?.shellPath) return null;
  if (defaultBashPaths(env).some((candidate) => exists(candidate))) return null;
  return gitExes.flatMap(gitBashFor).find((candidate) => exists(candidate)) ?? null;
}

function findGits() {
  try {
    return execFileSync('where.exe', ['git.exe'], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function main(argv = process.argv.slice(2)) {
  const piDir = path.resolve(argv[0] ?? path.join(os.homedir(), '.pi', 'agent'));
  const file = path.join(piDir, 'settings.json');
  if (process.platform !== 'win32' || !existsSync(file)) return null;
  const settings = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  const shellPath = shellPathToSet({ settings, gitExes: findGits() });
  if (!shellPath) return null;
  writeFileSync(file, `${JSON.stringify({ ...settings, shellPath }, null, 2)}\n`, 'utf8');
  console.log(`shellPath: ${shellPath}`);
  return shellPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`set-shell-path: ${error.message}`);
    process.exit(1);
  }
}
