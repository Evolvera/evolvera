#!/usr/bin/env node
/**
 * Mede CPU e RAM do PI Studio em fases: subida, ocioso sem navegador, com a interface aberta num Edge headless,
 * e com N projetos abertos (um PI `--mode rpc` por projeto). Conta também quantas vezes o servidor lê a lista
 * de processos do sistema e chama o Orca, e quanto custa cada leitura.
 *
 * Tudo roda em pastas temporárias: os projetos são pastas novas, o Studio lê uma cópia de ~/.pi/agent/sessions
 * (mais uma sessão sintética longa) e o Orca é o fake dos testes do Studio. Nenhum prompt é enviado ao PI.
 *
 * Uso: node scripts/studio/bench-studio.mjs --studio <pasta com server.mjs e test/fake-orca.mjs>
 *        [--port 4199] [--phase-ms 60000] [--projects 5] [--no-browser] [--direct-ps] [--out resultado.json]
 * --direct-ps usa o leitor de processos padrão do Studio (sem o wrapper que conta as leituras), para medir a CPU
 * de um leitor persistente; sem ele, cada leitura passa por um wrapper e é contada.
 */
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i === -1 ? fallback : args[i + 1]; };
const studio = path.resolve(opt('--studio', path.join(os.homedir(), '.pi', 'agent', 'studio')));
const port = Number(opt('--port', '4199'));
const phaseMs = Number(opt('--phase-ms', '60000'));
const projectCount = Number(opt('--projects', '5'));
const browser = !args.includes('--no-browser');
const directPs = args.includes('--direct-ps');
const outFile = opt('--out', null);
const sampleMs = 2000;
const realAgentDir = path.join(os.homedir(), '.pi', 'agent');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const temp = mkdtempSync(path.join(os.tmpdir(), 'pi-studio-bench-'));
const children = [];
const result = { studio, port, phaseMs, projectCount, cores: os.cpus().length, node: process.version, at: new Date().toISOString(), phases: {} };

function powershell(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
}

// CPU e pico de memória de um comando curto, medidos pelo Windows depois que ele termina (média de `runs`).
function measureCommand(file, argList, runs = 5) {
  const quoted = argList.map((item) => `'${item.replaceAll("'", "''")}'`).join(',');
  const out = path.join(temp, 'measure-out.txt');
  const script = `$r = @(); for ($i = 0; $i -lt ${runs}; $i++) {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $p = Start-Process -FilePath '${file}' -ArgumentList @(${quoted}) -PassThru -WindowStyle Hidden -RedirectStandardOutput '${out}' -RedirectStandardError '${out}.err'
    $p.WaitForExit(); $sw.Stop()
    $r += [pscustomobject]@{ cpuMs = $p.TotalProcessorTime.TotalMilliseconds; wallMs = $sw.ElapsedMilliseconds }
  }; $r | ConvertTo-Json -Compress`;
  const parsed = JSON.parse(powershell(script).stdout || '[]');
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const avg = (key) => Math.round(rows.reduce((sum, row) => sum + row[key], 0) / rows.length);
  return { runs: rows.length, cpuMs: avg('cpuMs'), wallMs: avg('wallMs') };
}

// Um PowerShell só, vivo a fase inteira: a cada intervalo grava a árvore de processos do servidor.
function startSampler(rootPid, file) {
  const script = `while ($true) {
    $all = Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name,WorkingSetSize,PrivatePageCount,KernelModeTime,UserModeTime,CommandLine
    $kids = @{}; foreach ($p in $all) { $k = [string]$p.ParentProcessId; if (-not $kids[$k]) { $kids[$k] = @() }; $kids[$k] += $p }
    $root = $all | Where-Object { $_.ProcessId -eq ${rootPid} }
    if (-not $root) { break }
    $queue = @($root); $rows = @()
    while ($queue.Count) { $p = $queue[0]; $queue = @($queue | Select-Object -Skip 1)
      $cmd = [string]$p.CommandLine; if ($cmd.Length -gt 160) { $cmd = $cmd.Substring(0, 160) }
      $rows += [pscustomobject]@{ pid = $p.ProcessId; ppid = $p.ParentProcessId; name = $p.Name; ws = $p.WorkingSetSize; priv = [int64]$p.PrivatePageCount; cpu = ($p.KernelModeTime + $p.UserModeTime) / 1e7; cmd = $cmd }
      if ($kids[[string]$p.ProcessId]) { $queue += $kids[[string]$p.ProcessId] } }
    $wmi = ($all | Where-Object { $_.Name -eq 'WmiPrvSE.exe' } | ForEach-Object { ($_.KernelModeTime + $_.UserModeTime) / 1e7 } | Measure-Object -Sum).Sum
    $line = ConvertTo-Json -InputObject ([pscustomobject]@{ at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); wmi = $wmi; rows = @($rows) }) -Compress -Depth 4
    Add-Content -LiteralPath '${file}' -Value $line
    Start-Sleep -Milliseconds ${sampleMs}
  }`;
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { stdio: 'ignore', windowsHide: true });
  children.push(child);
  return child;
}

function readSamples(file, from, to) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)).filter((s) => s.at >= from && s.at <= to);
}

const isPi = (row) => /--mode rpc/.test(row.cmd);
function summarize(samples, rootPid) {
  if (samples.length < 2) return null;
  const first = samples[0], last = samples.at(-1);
  const seconds = (last.at - first.at) / 1000;
  const byPid = (sample, pid) => sample.rows.find((row) => row.pid === pid);
  const cpuPct = (pid) => {
    const a = byPid(first, pid), b = byPid(last, pid);
    return a && b ? Math.round(((b.cpu - a.cpu) / seconds) * 1000) / 10 : null;
  };
  const mb = (bytes) => Math.round(bytes / 1048576);
  const server = byPid(last, rootPid);
  const pis = last.rows.filter(isPi).filter((row) => byPid(first, row.pid));
  const others = last.rows.filter((row) => row.pid !== rootPid && !isPi(row) && byPid(first, row.pid));
  const piStats = pis.map((row) => ({ pid: row.pid, wsMb: mb(row.ws), privMb: mb(row.priv), cpuPct: cpuPct(row.pid) }));
  return {
    seconds: Math.round(seconds),
    server: server && { wsMb: mb(server.ws), privMb: mb(server.priv), cpuPct: cpuPct(rootPid) },
    pis: piStats,
    piTotal: piStats.length ? { count: piStats.length, wsMb: piStats.reduce((s, p) => s + p.wsMb, 0), cpuPct: Math.round(piStats.reduce((s, p) => s + (p.cpuPct ?? 0), 0) * 10) / 10 } : null,
    peakServerWsMb: mb(Math.max(...samples.map((s) => byPid(s, rootPid)?.ws ?? 0))),
    // Filhos longevos que não são PI (ex.: o PowerShell persistente da lista de processos).
    helpers: others.map((row) => ({ name: row.name, wsMb: mb(row.ws), cpuPct: cpuPct(row.pid) })),
    // CPU do provedor WMI do Windows; inclui as consultas do próprio amostrador, iguais em todas as fases.
    wmiPct: first.wmi != null && last.wmi != null ? Math.round(((last.wmi - first.wmi) / seconds) * 1000) / 10 : null,
  };
}

function countLines(file) { return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).length : 0; }

async function api(base, token, route, init = {}) {
  const started = performance.now();
  const response = await fetch(`${base}${route}`, { ...init, headers: { 'x-pi-studio-token': token, 'content-type': 'application/json', ...(init.headers ?? {}) } });
  const body = await response.text();
  return { status: response.status, ms: Math.round(performance.now() - started), body };
}

async function phase(name, ctx, fn) {
  const counts0 = { ps: countLines(ctx.psLog), orca: countLines(ctx.orcaLog) };
  const from = Date.now();
  await fn();
  const to = Date.now();
  const counts = { ps: countLines(ctx.psLog) - counts0.ps, orca: countLines(ctx.orcaLog) - counts0.orca };
  const minutes = (to - from) / 60_000;
  result.phases[name] = { ...summarize(readSamples(ctx.samples, from, to), ctx.serverPid), processListReadsPerMin: Math.round(counts.ps / minutes * 10) / 10, orcaCallsPerMin: Math.round(counts.orca / minutes * 10) / 10 };
  console.log(name, JSON.stringify(result.phases[name]));
}

function findEdge() {
  for (const candidate of [path.join(process.env['ProgramFiles(x86)'] ?? '', 'Microsoft/Edge/Application/msedge.exe'), path.join(process.env.ProgramFiles ?? '', 'Microsoft/Edge/Application/msedge.exe')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function main() {
  // Agent dir lido pelo Studio: cópia das sessões reais + uma sessão sintética longa no projeto p1.
  const agentDir = path.join(temp, 'agent');
  mkdirSync(agentDir, { recursive: true });
  if (existsSync(path.join(realAgentDir, 'sessions'))) cpSync(path.join(realAgentDir, 'sessions'), path.join(agentDir, 'sessions'), { recursive: true, preserveTimestamps: true });
  if (existsSync(path.join(realAgentDir, 'agents'))) cpSync(path.join(realAgentDir, 'agents'), path.join(agentDir, 'agents'), { recursive: true });
  const projectsRoot = path.join(temp, 'projects');
  const projects = [];
  for (let i = 1; i <= projectCount; i += 1) {
    const dir = path.join(projectsRoot, `p${i}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), `{"name":"p${i}"}\n`);
    projects.push(dir);
  }
  const longDir = path.join(agentDir, 'sessions', 'bench-long');
  mkdirSync(longDir, { recursive: true });
  const lines = [JSON.stringify({ type: 'session', version: 3, id: 'bench-long', timestamp: new Date().toISOString(), cwd: projects[0] })];
  for (let i = 0; i < 4000; i += 1) {
    lines.push(JSON.stringify({ type: 'message', id: `u${i}`, timestamp: new Date().toISOString(), message: { role: 'user', content: [{ type: 'text', text: `pergunta ${i} ${'x'.repeat(400)}` }] } }));
    lines.push(JSON.stringify({ type: 'message', id: `a${i}`, timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: `resposta ${i} ${'y'.repeat(2000)}` }], stopReason: 'stop', usage: { input: 1000, output: 500, cost: { total: 0.001 } } } }));
  }
  writeFileSync(path.join(longDir, 'bench-long.jsonl'), `${lines.join('\n')}\n`);

  // Contadores: a lista de processos e o Orca passam por wrappers que registram cada chamada.
  const psLog = path.join(temp, 'ps.log'), orcaLog = path.join(temp, 'orca.log');
  const { resolveProcessTableCommand } = await import(pathToFileURL(path.join(studio, 'lib-server', 'process-table.mjs')));
  const real = resolveProcessTableCommand({ platform: process.platform, env: {} });
  const psWrapper = path.join(temp, 'ps-wrapper.mjs');
  writeFileSync(psWrapper, `import { appendFileSync } from 'node:fs'; import { spawn } from 'node:child_process';
appendFileSync(${JSON.stringify(psLog)}, Date.now() + '\\n');
const child = spawn(${JSON.stringify(real.bin)}, ${JSON.stringify(real.args)}, { stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true });
child.on('close', (code) => process.exit(code ?? 1));\n`);
  const orcaState = path.join(temp, 'orca-state.json');
  writeFileSync(orcaState, JSON.stringify({ active: projects[0], worktrees: projects.map((dir, i) => ({ path: dir, displayName: `p${i + 1}`, status: i === 0 ? 'active' : 'inactive', agents: [{ agent: 'pi', state: 'done', title: `tarefa ${i + 1}` }] })) }));
  const fakeOrca = path.join(studio, 'test', 'fake-orca.mjs');

  const env = {
    ...process.env, PI_WEB_PORT: String(port), PI_WEB_HOST: '127.0.0.1', PI_AGENT_DIR: agentDir,
    PI_PROJECT_ROOTS: JSON.stringify([projectsRoot]),
    ...(directPs ? {} : { PI_STUDIO_PS_BIN: process.execPath, PI_STUDIO_PS_BIN_ARGS: JSON.stringify([psWrapper]) }),
    PI_STUDIO_ORCA_BIN: process.execPath, PI_STUDIO_ORCA_BIN_ARGS: JSON.stringify([fakeOrca]),
    FAKE_ORCA_STATE: orcaState, FAKE_ORCA_COUNT_FILE: orcaLog,
  };
  const t0 = performance.now();
  const server = spawn(process.execPath, [path.join(studio, 'server.mjs')], { cwd: studio, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  children.push(server);
  let serverLog = '';
  server.stdout.on('data', (chunk) => { serverLog += chunk; });
  server.stderr.on('data', (chunk) => { serverLog += chunk; });
  while (!/listening on/.test(serverLog)) { if (server.exitCode !== null) throw new Error(serverLog); await sleep(20); }
  const listenMs = Math.round(performance.now() - t0);
  const base = `http://127.0.0.1:${port}`;
  const page = await (await fetch(`${base}/`)).text();
  const firstPageMs = Math.round(performance.now() - t0);
  const token = /name="pi-studio-token" content="([a-f0-9]+)"/.exec(page)[1];
  const projectsCall = await api(base, token, '/api/projects');
  let indexedMs = null;
  while (indexedMs === null) {
    const search = JSON.parse((await api(base, token, '/api/search?q=pergunta')).body);
    if (!search.indexing) indexedMs = Math.round(performance.now() - t0);
    else await sleep(100);
  }
  const usage = await api(base, token, '/api/usage/today');
  result.startup = { listenMs, firstPageMs, projectsMs: projectsCall.ms, searchIndexReadyMs: indexedMs, usageTodayMs: usage.ms, sessionFiles: readdirSync(path.join(agentDir, 'sessions'), { recursive: true }).filter((name) => String(name).endsWith('.jsonl')).length };
  console.log('startup', JSON.stringify(result.startup));

  const samples = path.join(temp, 'samples.jsonl');
  const ctx = { psLog, orcaLog, samples, serverPid: server.pid };
  startSampler(server.pid, samples);
  await sleep(sampleMs * 2);

  if (process.platform === 'win32') {
    result.costPerCall = {
      processList: measureCommand(real.bin, real.args, 5),
      orcaClosed: existsSync(path.join(process.env.LOCALAPPDATA ?? '', 'Programs/orca/resources/bin/orca.exe'))
        ? measureCommand(path.join(process.env.LOCALAPPDATA, 'Programs/orca/resources/bin/orca.exe'), ['worktree', 'ps', '--json'], 3) : null,
    };
    console.log('costPerCall', JSON.stringify(result.costPerCall));
  }

  await phase('idleNoClient', ctx, () => sleep(phaseMs));

  let edge = null;
  const edgeBin = browser ? findEdge() : null;
  if (edgeBin) {
    edge = spawn(edgeBin, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${path.join(temp, 'edge')}`, '--window-size=1440,900', `${base}/`], { stdio: 'ignore', windowsHide: true });
    children.push(edge);
    // Os primeiros 30 s com a interface aberta são aquecimento (títulos das sessões, subida do PI do projeto aberto).
    await phase('uiWarmup30s', ctx, () => sleep(30_000));
    await phase('uiOpenIdle', ctx, () => sleep(phaseMs));
  }

  const opened = [];
  for (const dir of projects) {
    const started = performance.now();
    const response = await api(base, token, '/api/projects/open-path', { method: 'POST', body: JSON.stringify({ cwd: dir }) });
    opened.push({ status: response.status, ms: Math.round(performance.now() - started) });
  }
  result.openProjects = opened;
  await sleep(20_000);
  const history = await api(base, token, `/api/projects/${JSON.parse((await api(base, token, '/api/projects')).body).projects.find((p) => p.cwd === projects[0])?.id}/history`);
  result.longSessionHistoryMs = history.ms;
  await phase(`withPis${projectCount}`, ctx, () => sleep(phaseMs));

  if (outFile) writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
}

// O PI cria em ~/.pi/agent/sessions uma pasta por projeto aberto; as dos projetos temporários saem se ficaram vazias.
function removeEmptySessionDirs() {
  const sessionsDir = path.join(realAgentDir, 'sessions');
  const marker = path.basename(temp).replace(/[^A-Za-z0-9]/g, '-');
  if (!existsSync(sessionsDir)) return;
  for (const name of readdirSync(sessionsDir)) {
    if (!name.includes(marker)) continue;
    try { rmdirSync(path.join(sessionsDir, name)); } catch { console.warn(`Pasta de sessão com conteúdo mantida: ${name}`); }
  }
}

// O msedge.exe inicial entrega a janela a outro processo e sai, então o taskkill pela árvore não basta.
function killBenchEdge() {
  if (process.platform !== 'win32') return;
  const marker = path.basename(temp).replaceAll("'", "''");
  powershell(`Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${marker}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`);
}

try {
  await main();
} finally {
  for (const child of children.reverse()) {
    if (child.exitCode === null && child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  }
  killBenchEdge();
  await sleep(1500);
  removeEmptySessionDirs();
  try { rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); } catch (error) { console.warn(`Temporário não removido (${error.code}): ${temp}`); }
}
