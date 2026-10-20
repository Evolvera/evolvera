#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BENCH_ROOT = path.resolve(HERE, '..');
const HARNESS_ROOT = '/Users/j.henrique/.pi/agent';
const ROOT = HARNESS_ROOT;
const TASK_ID = 'evolvera#31', BASE = 'b3ed83c6b8dc7e8bbc86f379be9c262b76d723ba', REFERENCE = '74ee0f3501169d2a27ac0176be60fcd498d469a8';
const MODEL = 'openai-codex/gpt-6.1-sol', THINKING = 'high';
const TARGETS = ['scripts/run-tests.mjs', 'scripts/test/run-tests.smoke.mjs'];
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const json = (p, x) => fs.writeFileSync(p, JSON.stringify(x, null, 2) + '\n', { mode: 0o600 });
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const task = () => readJson(path.join(BENCH_ROOT, 'tasks.json')).find(x => x.id === TASK_ID);
function command(cmd, args, opts = {}) { const r = requireSync(cmd, args, opts); if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stderr}`); return String(r.stdout??'').trim(); }
import { spawnSync as requireSync } from 'node:child_process';
function safeRoot(out) { const p = path.resolve(out); if (fs.existsSync(p)) throw Error(`output collision; refusing existing path: ${p}`); return p; }
function copyTree(src, dst, { exclude = () => false } = {}) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true, mode: 0o700 });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (exclude(ent.name, path.join(src, ent.name))) continue;
    const a = path.join(src, ent.name), b = path.join(dst, ent.name), st = fs.lstatSync(a);
    if (st.isSymbolicLink()) { const target = fs.realpathSync(a), targetStat = fs.statSync(target); if (targetStat.isFile()) fs.copyFileSync(target, b); }
    else if (st.isDirectory()) copyTree(a, b, { exclude });
    else if (st.isFile()) { fs.copyFileSync(a, b); fs.chmodSync(b, st.mode & 0o700); }
  }
}
function initWorkspace(dest) {
  fs.mkdirSync(dest, { recursive: true });
  const tar = requireSync('git', ['archive', BASE], { cwd: HARNESS_ROOT, encoding: null, maxBuffer: 1024 ** 3 });
  if (tar.status) throw Error('baseline git archive failed (baseline object required locally)');
  const x = requireSync('tar', ['-x', '-C', dest], { input: tar.stdout }); if (x.status) throw Error('baseline extraction failed');
  const historicContext = path.join(dest,'.pi'); if (fs.existsSync(historicContext)) fs.rmSync(historicContext,{recursive:true,force:true});
  command('git', ['init', '--quiet'], { cwd: dest });
  command('git', ['config', 'user.name', 'Sol Comparison'], { cwd: dest }); command('git', ['config', 'user.email', 'comparison@localhost'], { cwd: dest });
  command('git', ['add', '-A'], { cwd: dest }); command('git', ['commit', '--quiet', '-m', 'comparison baseline'], { cwd: dest });
  const marker=command('git',['rev-parse','HEAD'],{cwd:dest});
  command('git', ['config', '--local', 'credential.helper', ''], { cwd: dest });
  for (const r of command('git', ['remote'], { cwd: dest }).split(/\s+/).filter(Boolean)) command('git', ['remote', 'remove', r], { cwd: dest });
  return marker;
}
function manifestWrite(root, data) { json(path.join(root, 'manifest.json'), data); }
function preflightReceipt() { const p='/private/var/folders/q4/g0d2x3rn1kn6hwl97mhp86nh0000gp/T/sol-comparison-preflight-s3feivl1/receipt.json';const r=readJson(p);if(r.receipts?.length!==2||!r.receipts.some(x=>x.arm==='base'&&x.source_sha===BASE&&x.exit_code===1)||!r.receipts.some(x=>x.arm==='reference'&&x.source_sha===REFERENCE&&x.exit_code===0)||r.receipts.some(x=>x.oracle_sha256!=='28a2b0580102fc9d9a7205e88d53e2daf131d5e7cd4f38e9dcda239a44e369c1'))throw Error('provided synthetic oracle preflight receipt does not match frozen task/source hashes');return {source:'orchestrator-preflight',oracleSHA:r.receipts[0].oracle_sha256,base:{exitCode:1,wallSeconds:r.receipts.find(x=>x.arm==='base').wall_seconds,resourceProof:r.receipts.find(x=>x.arm==='base').resources},reference:{exitCode:0,wallSeconds:r.receipts.find(x=>x.arm==='reference').wall_seconds,resourceProof:r.receipts.find(x=>x.arm==='reference').resources},syntheticSections:5}; }
function setUp(root) {
  const t = task(); if (!t || t.base_sha !== BASE || t.merge_sha !== REFERENCE) throw Error('benchmark task metadata differs from frozen contract');
  for (const sha1 of [BASE, REFERENCE]) command('git', ['cat-file', '-e', `${sha1}^{commit}`], { cwd: HARNESS_ROOT });
  const p = path.join(BENCH_ROOT, 'problems', `${TASK_ID}.md`), problem = fs.readFileSync(p, 'utf8');
  const settingsBytes=fs.readFileSync(path.join(HARNESS_ROOT,'settings.json')),memoryConfig=fs.readFileSync(path.join(HARNESS_ROOT,'extensions/plastic-memory/config.ts')),piPkg=readJson('/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/package.json'),protocol=fs.readFileSync(path.join(HERE,'PROTOCOL.md'));const m = { schema: 1, task: TASK_ID, base: BASE, reference: REFERENCE, piVersion:piPkg.version, harnessSHA: command('git', ['rev-parse', 'HEAD'], { cwd: HARNESS_ROOT }), protocolSHA:sha(protocol), problemSHA: sha(problem), rates: readRates(), memoryAutoWorkersEnabled:false, memoryConfigSHA:sha(Buffer.concat([Buffer.from(sha(settingsBytes)),Buffer.from(sha(memoryConfig))])), oraclePreflight:preflightReceipt(), createdAt: new Date().toISOString(), runs: [], judges: [] };
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  for (const wave of [1,2,3]) for (const arm of ['orchestrator','solo']) {
    const id = `w${wave}-${arm}`, d = path.join(root, 'runs', id); fs.mkdirSync(d, { recursive: true, mode: 0o700 });
    const baseMarker=initWorkspace(path.join(d,'workspace')); fs.writeFileSync(path.join(d,'prompt.txt'), contestantPrompt(problem,arm), { mode: 0o600 });
    m.runs.push({ id, wave, arm, baseMarker, status: 'prepared', workspace: `runs/${id}/workspace`, profile: `runs/${id}/profile`, session: `runs/${id}/session`, home: `runs/${id}/home`, temp: `runs/${id}/tmp` });
  }
  manifestWrite(root,m); return m;
}
function readRates() {
  try { const models=readJson(path.join(HARNESS_ROOT,'models.json')); const rec=models.providers?.['openai-codex']?.models?.find(x=>x.id==='gpt-6.1-sol') || models['openai-codex']?.models?.find(x=>x.id==='gpt-6.1-sol'); return rec?.cost || rec?.pricing || null; } catch { return null; }
}
function canonical(p) { return fs.realpathSync(p); }
function sbQuote(p) { return `"${canonical(p).replaceAll('\\','\\\\').replaceAll('"','\\"')}"`; }
function sandboxProfile(ownedRoot,{denyRoots=[],denyNetwork=false}={}) {
  if(process.platform!=='darwin'||!fs.existsSync('/usr/bin/sandbox-exec'))throw Error('BLOCKED: sandbox-exec unavailable');
  const owned=canonical(ownedRoot);
  const deny=[os.homedir(),'/private/var/folders','/private/var/tmp',...denyRoots];
  const allow=[owned,path.join(HARNESS_ROOT,'npm'),'/Users/j.henrique/npm-global/lib/node_modules/@earendil-works/pi-coding-agent',path.resolve(path.dirname(process.execPath),'..')];
  return '(version 1)\n(allow default)\n(deny file-write*)\n(allow file-write* (literal "/dev/null"))\n'
    +deny.filter(fs.existsSync).map(p=>`(deny file-read* (subpath ${sbQuote(p)}))`).join('\n')+'\n'
    +allow.filter(fs.existsSync).map(p=>`(allow file-read* (subpath ${sbQuote(p)}))`).join('\n')+'\n'
    +'(allow file-read-metadata)\n'+(denyNetwork?'(deny network*)\n':'')
    +`(allow file-write* (subpath ${sbQuote(owned)}))\n`;
}
function resolveBin(name) { for(const dir of (process.env.PATH||'').split(path.delimiter)){const p=path.join(dir,name);if(fs.existsSync(p))return fs.realpathSync(p);}throw Error(`required executable unavailable: ${name}`); }
function sandboxArgs(binary,args,ownedRoot,profileFile,options={}) { const text=sandboxProfile(ownedRoot,options);fs.writeFileSync(profileFile,text,{mode:0o600});return ['/usr/bin/sandbox-exec','-f',profileFile,binary,...args]; }
function otherRoots(root,owned) { const canonicalOwned=canonical(owned),out=[];for(const dir of ['runs','grading','grading-base','grading-reference','grading-home','grading-tmp','judges']){const parent=path.join(root,dir);if(!fs.existsSync(parent))continue;for(const ent of fs.readdirSync(parent,{withFileTypes:true})){const p=path.join(parent,ent.name);if(ent.isDirectory()&&canonical(p)!==canonicalOwned&&!canonicalOwned.startsWith(canonical(p)+path.sep))out.push(p);}}return out; }
function isolatedEnv(extra) { const env={...process.env,...extra};for(const k of Object.keys(env))if(k.startsWith('ORCA_')||k.startsWith('PI_GOAL')||k==='PI_REPORT_RUN'||/TOKEN|API_KEY|SECRET|PASSWORD|CREDENTIAL/i.test(k))delete env[k];return env; }
function contestantPrompt(problem,arm) { const solo=arm==='solo';return `${problem.trim()}\n\nPermitted product files: ${TARGETS.join(', ')}. Only transient .pi/build and .pi/recovery may also be written. Use only synthetic tests from the supplied contract; do not run real suites, applications, network, databases, Docker, package installs, or external/host operations. Preserve unrelated files.\n\n${solo?'SOLO direct-execution exception: this overrides contrary SYSTEM.md delegation requirements. Do not launch, message, or delegate to other agents, including through Agent tools, @mentions, or shell commands.':'Use normal harness orchestration, but do not delegate to design, website, SEO, or home-design agents at any depth; no external/host operations.'} No source/history/harness location is provided beyond the current workspace.`; }
function profile(run, root) {
  const base=path.join(root,run.profile), home=path.join(root,run.home), tmp=path.join(root,run.temp); for (const d of [base,home,tmp,path.join(root,run.session)]) fs.mkdirSync(d,{recursive:true,mode:0o700});
  for (const f of ['SYSTEM.md','settings.json','models.json','models-store.json','auth.json','subagents.json']) { const s=path.join(HARNESS_ROOT,f); if (fs.existsSync(s)) { fs.copyFileSync(s,path.join(base,f)); fs.chmodSync(path.join(base,f), f==='auth.json'?0o600:0o600); } }
  for (const d of ['agents','skills','prompts','extensions','themes','templates','npm']) {
    const src=path.join(HARNESS_ROOT,d), dst=path.join(base,d); if (!fs.existsSync(src)) continue;
    if(d==='npm'){fs.symlinkSync(src,dst,'dir');continue;}
    copyTree(src,dst,{exclude:(name,p)=> /^(sessions|results|research|\.pi|node_modules|\.git)$/.test(name) || (d==='agents' && /(?:design|website|seo|home)/i.test(name)) || /(?:\.cache|cache)/i.test(name)});
  }
  return {base,home,tmp};
}
function forbiddenDispatch(name, input, arm) {
  const type = String(input?.subagent_type || input?.type || input?.agent_type || '');
  if (arm === 'solo' && ['Agent', 'get_subagent_result', 'steer_subagent'].includes(name)) return true;
  if (name === 'Agent' && /design|website|seo|home/i.test(type)) return true;
  if (name === 'read' && /(?:^|\/)(?:auth\.json|\.npmrc)$/.test(input?.path || '')) return true;
  if (name !== 'bash') return false;
  const cmd = input?.command || '';
  return /(?:^|[;&|\n])\s*(?:pi|orca|gh|curl|wget|ssh|nc)(?:\s|$)/m.test(cmd)
    || /(?:^|[;&|\n])\s*git\s+(?:push|fetch|clone|pull)(?:\s|$)/m.test(cmd)
    || /(?:^|[;&|\n])\s*npm\s+(?:install|i)(?:\s|$)/m.test(cmd)
    || /(?:spawn|exec|system|run)\w*\s*\(\s*["'](?:pi|orca|gh|curl|wget|ssh|nc)["']/i.test(cmd);
}
function telemetryExtension() {
  return `import fs from 'node:fs';
import path from 'node:path';
const forbiddenDispatch = ${forbiddenDispatch.toString()};
const file = process.env.SOL_COMPARISON_EVENTS;
const emit = x => fs.appendFileSync(file, JSON.stringify({at:new Date().toISOString(),...x})+'\\n',{mode:0o600});
const root=Symbol.for('sol-comparison.root-session'), registry=Symbol.for('pi-subagents:manager');
export default function(pi) {
 pi.on('session_start',(_e,c)=>{if(!globalThis[root])globalThis[root]=c.sessionManager.getSessionId();emit({kind:'session_start',session:globalThis[root],model:c.model?.provider+'/'+c.model?.id,thinking:pi.getThinkingLevel?.()});});
 pi.on('message_end',(e,c)=>{if(c.sessionManager.getSessionId()===globalThis[root]&&e.message?.role==='assistant')emit({kind:'root_usage',model:e.message.model,usage:e.message.usage||null});});
 const modelFor=e=>{try{return fs.readFileSync(path.join(process.env.PI_CODING_AGENT_DIR,'agents',e.type+'.md'),'utf8').match(/^model:\\s*["']?([^\\n"']+)/m)?.[1]?.trim()||null;}catch{return null;}};
 for(const kind of ['subagents:started','subagents:completed','subagents:failed'])pi.events.on(kind,e=>emit({kind,worker:{id:e.id,type:e.type,model:modelFor(e),status:e.status,usage:e.usage||null,durationMs:e.durationMs}}));
 pi.on('tool_call',e=>{if(forbiddenDispatch(e.toolName,e.input,process.env.SOL_COMPARISON_ARM)){emit({kind:'policy_block',tool:e.toolName});return {block:true,reason:'benchmark prohibits delegation in solo, design agents and external dispatch'};}});
 pi.on('agent_end',async(_e,c)=>{if(c.sessionManager.getSessionId()!==globalThis[root])return;const m=globalThis[registry];if(m){await m.waitForAll();while(m.hasRunning())await m.waitForAll();}});
}`;
}
function auditRootTranscript(sessionDir, arm) {
  const found=[];
  for (const name of fs.readdirSync(sessionDir).filter(x=>x.endsWith('.jsonl'))) {
    for (const line of fs.readFileSync(path.join(sessionDir,name),'utf8').split(/\r?\n/)) {
      let event;try{event=JSON.parse(line);}catch{continue;}
      const m=event.message;if(m?.role!=='assistant')continue;
      for(const c of m.content||[])if(c.type==='toolCall'&&forbiddenDispatch(c.name,c.arguments,arm))found.push({tool:c.name,kind:'prohibited_dispatch_attempt'});
    }
  }
  return found;
}
function usageTotals(events) {
  const total={input:0,output:0,cacheRead:0,cacheWrite:0,reasoning:0,cost:0}; let known=true,anyUsage=false; const add=(u)=>{if(!u){known=false;return;} anyUsage=true; const map={input:['input','input_tokens'],output:['output','output_tokens'],cacheRead:['cacheRead','cache_read','cache_read_tokens'],cacheWrite:['cacheWrite','cache_write'],reasoning:['reasoning','reasoning_tokens']}; for(const [k,keys] of Object.entries(map)){const v=keys.map(x=>u[x]).find(x=>x!=null);if(v==null){if(k!=='reasoning')known=false;}else total[k]+=Number(v)||0;} const c=u.cost?.total??u.cost_total??(typeof u.cost==='number'?u.cost:null);if(c==null)known=false;else total.cost+=Number(c)||0;};
  let rootSeen=false;for(const e of events)if(e.kind==='root_usage'){rootSeen=true;add(e.usage);}
  const workers=new Map(), started=new Set();for(const e of events){if(e.kind==='subagents:started'&&e.worker?.id){started.add(e.worker.id);if(!workers.has(e.worker.id))workers.set(e.worker.id,{...e.worker,status:e.worker.status||'started'});}if(['subagents:completed','subagents:failed'].includes(e.kind)&&e.worker?.id)workers.set(e.worker.id,e.worker);}
  for(const w of workers.values())if(w.usage)add(w.usage);else known=false;if(!anyUsage||!rootSeen||[...started].some(id=>!workers.has(id)||workers.get(id).status==='started'))known=false;
  return {usage:known?total:null,workers:[...workers.values()],workerCount:workers.size};
}
function elapsedMedianMean(nums) { const a=nums.filter(Number.isFinite).sort((x,y)=>x-y); if(!a.length)return {mean:null,median:null};return {mean:a.reduce((s,x)=>s+x,0)/a.length,median:a.length%2?a[Math.floor(a.length/2)]:(a[a.length/2-1]+a[a.length/2])/2}; }
function diff(root,id,baseMarker=null) { const d=path.join(root,'runs',id,'workspace'); command('git',['add','-A','-N'],{cwd:d}); const marker=baseMarker||readJson(path.join(root,'manifest.json')).runs.find(r=>r.id===id)?.baseMarker;if(!marker)throw Error(`fresh baseline marker missing for ${id}`);const out=command('git',['diff','--name-only',marker],{cwd:d}); const files=out.split(/\r?\n/).filter(Boolean); const product=files.filter(x=>!x.startsWith('.pi/')); return {files,productFiles:product,patch:command('git',['diff','--binary',marker,'--',...product],{cwd:d})}; }
function blindPayload(runs) { return runs.map(r=>({id:r.anonymous,contract:r.contract,files:r.files,patch:r.patch,tests:r.tests})); }
function blindContract() { const p=fs.readFileSync(path.join(BENCH_ROOT,'problems',`${TASK_ID}.md`),'utf8').trim();return `${p}\n\nPermitted product files: ${TARGETS.join(', ')}. Only transient .pi/build and .pi/recovery may also be written. Synthetic tests only; no real suites or external/stateful operations.`; }
function anonymousMapping(runs) { return Object.fromEntries(runs.map(r=>[r.anonymous,r.id])); }
function validateScores(value, ids) {
  if(!value||!Array.isArray(value.submissions))throw Error('judge JSON must contain submissions array'); const map=new Map();
  const dimensions=['correctness/contract fidelity','robustness/error handling','maintainability/KISS/SoC','scope/safety preservation','test quality'];for(const s of value.submissions){if(!ids.includes(s.id)||map.has(s.id)||!Array.isArray(s.dimensions)||s.dimensions.length!==5)throw Error(`invalid/duplicate judge submission: ${s.id}`);if(new Set(s.dimensions.map(d=>d.name)).size!==5||dimensions.some(n=>!s.dimensions.some(d=>d.name===n)))throw Error(`missing/duplicate rubric dimension for ${s.id}`);for(const d of s.dimensions)if(!Number.isInteger(d.score)||d.score<0||d.score>20||typeof d.citation!=='string'||!/[\w./-]+:\d+/.test(d.citation))throw Error(`invalid score/citation for ${s.id}`);map.set(s.id,{...s,total:s.dimensions.reduce((a,d)=>a+d.score,0)});}
  if(map.size!==ids.length)throw Error('judge response does not cover all anonymous IDs');return map;
}
function parseFinal(text) {
 const raw=String(text),candidates=[...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map(x=>x[1]);
 let start=-1,depth=0,quoted=false,escaped=false;
 for(let i=0;i<raw.length;i++){const c=raw[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}if(c==='"'&&depth){quoted=true;continue;}if(c==='{'){if(!depth)start=i;depth++;}else if(c==='}'&&depth&&!--depth)candidates.push(raw.slice(start,i+1));}
 candidates.push(raw);for(const c of candidates){try{const v=JSON.parse(c);if(Array.isArray(v.submissions))return v;}catch{}}
 throw Error('no valid submissions JSON in judge final');
}
function runCommand(binary,args,opts={}) { return new Promise(resolve=>{const {timeout,input,startupReady,startupTimeout=60000,...spawnOpts}=opts,p=spawn(binary,args,{...spawnOpts,stdio:[input==null?'ignore':'pipe','pipe','pipe'],detached:true}),chunks=[];if(input!=null)p.stdin.end(input);let timedOut=false,spawnError=null;const killGroup=signal=>{try{process.kill(-p.pid,signal);}catch{try{p.kill(signal);}catch{}}};const timer=timeout?setTimeout(()=>{timedOut=true;killGroup('SIGTERM');setTimeout(()=>{if(p.exitCode===null)killGroup('SIGKILL');},5000).unref();},timeout):null;p.stdout?.on('data',x=>chunks.push(x));p.stderr?.on('data',x=>chunks.push(x));p.on('error',e=>{spawnError=e.message;});const startupTimer=startupReady?setTimeout(()=>{if(!startupReady()){spawnError='startup did not create its session receipt';timedOut=true;killGroup('SIGTERM');}},startupTimeout):null;p.on('close',(code,signal)=>{if(startupTimer)clearTimeout(startupTimer);if(timer)clearTimeout(timer);resolve({code,signal,timedOut,error:spawnError,text:Buffer.concat(chunks).toString()});});}); }
function redact(text) { return String(text).replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi,'$1[redacted]').replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,'[redacted-token]'); }
async function run(root) {
 const m=readJson(path.join(root,'manifest.json')); const ready=m.runs.filter(r=>r.status==='prepared');
 for(let i=0;i<ready.length;i+=2) { await Promise.all(ready.slice(i,i+2).map(async r=>{
   const dir=path.join(root,'runs',r.id);r.status='launching';manifestWrite(root,m);
   try { if(fs.existsSync(path.join(root,r.profile))||fs.existsSync(path.join(root,r.session)))throw Error('run profile/session already exists; refusing retry');const prof=profile(r,root), ext=path.join(dir,'meter.mjs'); fs.writeFileSync(ext,telemetryExtension(),{mode:0o600}); const events=path.join(dir,'events.jsonl');
   const env=isolatedEnv({PI_CODING_AGENT_DIR:prof.base,PI_CODING_AGENT_SESSION_DIR:path.join(root,r.session),HOME:prof.home,TMPDIR:prof.tmp,TMP:prof.tmp,TEMP:prof.tmp,SOL_COMPARISON_EVENTS:events,SOL_COMPARISON_ARM:r.arm,GH_CONFIG_DIR:path.join(dir,'gh-empty')});
   fs.mkdirSync(env.GH_CONFIG_DIR,{recursive:true,mode:0o700});const piArgs=['-p','--mode','json','--offline','--no-context-files','--no-approve','--session-dir',path.join(root,r.session),'--model',MODEL,'--thinking',THINKING,'--extension',ext,...(r.arm==='solo'?['--exclude-tools','Agent,get_subagent_result,steer_subagent']:[]),fs.readFileSync(path.join(dir,'prompt.txt'),'utf8')],launch=sandboxArgs(resolveBin('pi'),piArgs,dir,path.join(dir,'sandbox.sb'),{denyRoots:otherRoots(root,dir)});r.sandboxProfile=path.relative(root,path.join(dir,'sandbox.sb'));r.sandboxSHA=sha(fs.readFileSync(path.join(dir,'sandbox.sb')));r.requestedModel=MODEL;r.thinking=THINKING;const started=process.hrtime.bigint(), result=await runCommand(launch[0],launch.slice(1),{cwd:path.join(dir,'workspace'),env,timeout:30*60*1000,startupReady:()=>fs.existsSync(events)});
   const ms=Number(process.hrtime.bigint()-started)/1e6; fs.writeFileSync(path.join(dir,'stdout.jsonl'),redact(result.text),{mode:0o600}); const telemetry=fs.existsSync(events)?fs.readFileSync(events,'utf8').trim().split(/\n/).filter(Boolean).map(x=>{try{return JSON.parse(x)}catch{return null}}).filter(Boolean):[];
   const totals=usageTotals(telemetry),audit=auditRootTranscript(path.join(root,r.session),r.arm);r.exitCode=result.code;r.signal=result.signal;r.timedOut=result.timedOut;r.durationMs=ms;r.usage=totals.usage;r.workers=totals.workers;r.workerCount=totals.workerCount;r.policyViolations=[...telemetry.filter(e=>e.kind==='policy_block').map(e=>({tool:e.tool,kind:'blocked'})),...audit];r.status=result.timedOut?'timeout':result.code===0?'terminal':'infrastructure_error';r.productDiff=diff(root,r.id,r.baseMarker).productFiles;r.finishedAt=new Date().toISOString();manifestWrite(root,m);
   } catch(e) { r.status='setup_error';r.error=String(e.message||e).slice(0,1000);r.finishedAt=new Date().toISOString();manifestWrite(root,m); }
 }));
 if(ready.slice(i,i+2).some(r=>['setup_error','infrastructure_error'].includes(r.status)||(r.status==='timeout'&&!r.usage)))throw Error('infrastructure/startup failure: later waves were not launched');
 }
}
function safeGradeCopy(root,id,dest) { const source=path.join(root,'runs',id,'workspace');fs.mkdirSync(dest,{recursive:true,mode:0o700});copyTree(source,dest);const shown=requireSync('git',['show',`${REFERENCE}:scripts/test/run-tests.smoke.mjs`],{cwd:HARNESS_ROOT,encoding:null});if(shown.status!==0)throw Error('oracle object unavailable locally');const oracle=shown.stdout;const p=path.join(dest,'scripts/test/run-tests.smoke.mjs');fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,oracle,{mode:0o600});return {copy:dest,oracleSHA:sha(oracle),command:'node scripts/test/run-tests.smoke.mjs'}; }
function archiveCommit(commit,dest) { fs.mkdirSync(dest,{recursive:true});const a=requireSync('git',['archive',commit],{cwd:ROOT,encoding:null,maxBuffer:1024**3});if(a.status)throw Error(`git archive failed: ${commit}`);const x=requireSync('tar',['-x','-C',dest],{input:a.stdout});if(x.status)throw Error('archive extraction failed');const old=path.join(dest,'.pi');if(fs.existsSync(old))fs.rmSync(old,{recursive:true,force:true}); }
function executeOracle(cwd,ownedRoot,home,tmp) { const p=path.join(ownedRoot,'sandbox.sb'),argv=sandboxArgs(process.execPath,['scripts/test/run-tests.smoke.mjs'],ownedRoot,p,{denyRoots:otherRoots(path.dirname(path.dirname(ownedRoot)),ownedRoot),denyNetwork:true}),r=requireSync(argv[0],argv.slice(1),{cwd,encoding:'utf8',timeout:120000,env:{PATH:process.env.PATH,HOME:home,TMPDIR:tmp,TMP:tmp,TEMP:tmp}});return {exitCode:r.status,signal:r.signal,stdout:r.stdout||'',stderr:r.stderr||''}; }
function defaultProbe(root, candidate, home, tmp) {
  const script=path.join(root,'default-oracle.mjs'), inventoryFile=path.join(root,'inventory.json');
  fs.copyFileSync(path.join(HERE,'default-oracle.mjs'),script);
  const inventory=command('git',['ls-tree','-r','--name-only',BASE,'extensions/test','scripts/test'],{cwd:HARNESS_ROOT}).split('\n').filter(x=>x.endsWith('.smoke.mjs'));
  json(inventoryFile,inventory);
  const argv=sandboxArgs(process.execPath,[script,path.join(candidate,'scripts/run-tests.mjs'),inventoryFile,tmp],root,path.join(root,'sandbox-default.sb'),{denyNetwork:true});
  const r=requireSync(argv[0],argv.slice(1),{cwd:root,encoding:'utf8',timeout:45000,env:{PATH:process.env.PATH,HOME:home,TMPDIR:tmp,TMP:tmp,TEMP:tmp}});
  let value;try{value=JSON.parse(r.stdout);}catch{value={pass:false,stderr:r.stderr||'',stdout:r.stdout||''};}
  return {...value,exitCode:r.status};
}
async function grade(root,id,approved) {
  if(approved!==id)throw Error('grading requires --approved exact run ID after source safety review');
  const m=readJson(path.join(root,'manifest.json')),r=m.runs.find(x=>x.id===id);
  if(!r||!['terminal','timeout'].includes(r.status))throw Error('run has no safe reviewable submission');
  const g=path.join(root,'grading',id);if(fs.existsSync(g))throw Error('grading resource already exists');
  fs.mkdirSync(g,{recursive:true,mode:0o700});
  const candidate=path.join(g,'submission'),receipt=safeGradeCopy(root,id,candidate);
  if(receipt.oracleSHA!==m.oraclePreflight.oracleSHA)throw Error('oracle bytes differ from verified preflight');
  const home=path.join(g,'home'),tmp=path.join(g,'tmp');for(const x of[home,tmp])fs.mkdirSync(x,{recursive:true});
  receipt.syntheticCases=5;receipt.base=m.oraclePreflight.base;receipt.reference=m.oraclePreflight.reference;
  receipt.submission=executeOracle(candidate,g,home,tmp);
  receipt.defaultContract=defaultProbe(g,candidate,home,tmp);
  receipt.testPass=receipt.submission.exitCode===0&&receipt.defaultContract.pass===true;
  receipt.submissionResult=receipt.testPass?'PASS':'FAIL';
  receipt.resources={ownedRoot:g,home,tmp,proof:'DISPOSABLE_VERIFIED: synthetic fake roots only; protected home and other runs unreachable; original suites never executed'};
  receipt.oracleBaselinePass=receipt.base.exitCode!==0;receipt.oracleReferencePass=receipt.reference.exitCode===0;
  json(path.join(g,'receipt.json'),receipt);r.testPass=receipt.testPass;r.testStatus=receipt.submissionResult;manifestWrite(root,m);return receipt;
}
function judgePrompt(payload) {return `Independently assess code quality, not execution or cost. Return ONLY JSON: {"submissions":[{"id":"...","dimensions":[{"name":"correctness/contract fidelity","score":0,"citation":"file:line evidence"},{"name":"robustness/error handling","score":0,"citation":"..."},{"name":"maintainability/KISS/SoC","score":0,"citation":"..."},{"name":"scope/safety preservation","score":0,"citation":"..."},{"name":"test quality","score":0,"citation":"..."}]}]}. Each score integer 0-20, cite supplied code lines. IDs exactly once. Objective test outcomes are context only, not score. The original five-case oracle is the primary functional test. The supplemental default probe uses harmless replacements under historical filenames: its execution count measures classification coverage, not proof that the original excluded tests are safe. Assess safety-exclusion claims from supplied code; flag missing evidence rather than assuming all 51 must execute.\nPayload:\n${JSON.stringify(payload)}`; }
async function judge(root) {const m=readJson(path.join(root,'manifest.json'));const submissions=[];for(const r of m.runs){if(r.status!=='terminal')continue;const d=diff(root,r.id,r.baseMarker),anonymous=crypto.randomBytes(8).toString('hex');r.anonymous=anonymous;submissions.push({anonymous,contract:blindContract(),files:d.productFiles,patch:d.patch,tests:readGrade(root,r.id)});}if(submissions.length!==6)throw Error('blind judge requires six terminal runs');for(let i=submissions.length-1;i>0;i--){const j=crypto.randomInt(i+1);[submissions[i],submissions[j]]=[submissions[j],submissions[i]];}const payload=blindPayload(submissions),dir=path.join(root,'judges');fs.mkdirSync(dir,{recursive:true,mode:0o700});const jid=crypto.randomBytes(8).toString('hex'),judgeRoot=path.join(dir,jid),pf=profile({profile:`judges/${jid}/profile`,home:`judges/${jid}/home`,temp:`judges/${jid}/tmp`,session:`judges/${jid}/session`},root),profileDir=pf.base,home=pf.home,tmp=pf.tmp,session=path.join(root,`judges/${jid}/session`),prompt=judgePrompt(payload),judgeEnv={...process.env,PI_CODING_AGENT_DIR:profileDir,HOME:home,TMPDIR:tmp,TMP:tmp,TEMP:tmp};const guard=path.join(judgeRoot,'judge-guard.mjs');fs.writeFileSync(guard,`export default function(pi){pi.on('tool_call',e=>{if(!['read','grep','find','ls'].includes(e.toolName))return {block:true,reason:'blind judge is read-only'};});}`,{mode:0o600});const judgeArgs=['-p','--mode','json','--offline','--no-context-files','--no-approve','--session-dir',session,'--model',MODEL,'--thinking',THINKING,'--tools','read,grep,find,ls','--extension',guard],launch=sandboxArgs(resolveBin('pi'),judgeArgs,judgeRoot,path.join(judgeRoot,'sandbox.sb'),{denyRoots:otherRoots(root,judgeRoot)});fs.mkdirSync(path.join(judgeRoot,'gh-empty'),{recursive:true,mode:0o700});const started=process.hrtime.bigint(),res=await runCommand(launch[0],launch.slice(1),{cwd:judgeRoot,env:isolatedEnv({...judgeEnv,GH_CONFIG_DIR:path.join(judgeRoot,'gh-empty')}),timeout:30*60*1000,input:prompt});const ms=Number(process.hrtime.bigint()-started)/1e6;fs.writeFileSync(path.join(judgeRoot,'raw.jsonl'),res.text,{mode:0o600});let final=null;const judgeUsageEvents=[];for(const l of res.text.split(/\r?\n/)){try{const e=JSON.parse(l);if(e.type==='message_end'&&e.message?.role==='assistant'){final=e.message.content?.map(c=>c.text||'').join('')||final;if(e.message.usage)judgeUsageEvents.push({kind:'root_usage',usage:e.message.usage});}}catch{}}let validated=null,error=null;try{validated=validateScores(parseFinal(final||res.text),submissions.map(s=>s.anonymous));if(res.code!==0||res.timedOut){validated=null;throw Error(res.timedOut?'judge timeout':'judge process exited nonzero');}}catch(e){error=e.message;}const judgeUsage=usageTotals(judgeUsageEvents);m.judges.push({id:jid,status:validated?'valid':'blocked',durationMs:ms,usage:judgeUsage.usage,exitCode:res.code,error,ids:submissions.map(s=>s.anonymous)});m.mapping=anonymousMapping(submissions.map(s=>({anonymous:s.anonymous,id:m.runs.find(r=>r.anonymous===s.anonymous).id})));manifestWrite(root,m);if(validated)json(path.join(judgeRoot,'scores.json'),Object.fromEntries(validated)); }
function readGrade(root,id){const p=path.join(root,'grading',id,'receipt.json');if(!fs.existsSync(p))return 'not graded';const r=readJson(p);return {originalOracle:r.submission.exitCode===0?'PASS':'FAIL',syntheticCases:r.syntheticCases,defaultProbe:{expected:r.defaultContract.expectedExecutions,executed:r.defaultContract.executed,unexpected:r.defaultContract.unexpected,missing:r.defaultContract.missing},combinedStrictResult:r.submissionResult};}
function report(root) {
 const m=readJson(path.join(root,'manifest.json')),judge=m.judges.at(-1),scoreFile=judge&&path.join(root,'judges',judge.id,'scores.json'),scores=scoreFile&&fs.existsSync(scoreFile)?readJson(scoreFile):null;
 const lines=['| Run | Arm | Cost (PI equivalent, not invoice) | Wall time | Workers | Original oracle | Default coverage probe | Quality |','|---|---|---:|---:|---:|---|---:|---:|'];
 for(const r of m.runs){const sc=scores?.[r.anonymous],g=readGrade(root,r.id),probe=g.defaultProbe;lines.push(`| ${r.id} | ${r.arm} | ${r.usage?.cost==null?'unknown':`$${r.usage.cost.toFixed(4)}`} | ${r.durationMs==null?'—':`${(r.durationMs/1000).toFixed(1)}s`} | ${r.workerCount??'—'} | ${g.originalOracle||g} | ${probe?`${probe.executed}/${probe.expected}`:'—'} | ${sc?.total==null?'—':`${sc.total}/100`} |`);}
 for(const arm of ['orchestrator','solo']){const a=m.runs.filter(r=>r.arm===arm),cost=elapsedMedianMean(a.map(r=>r.usage?.cost)),duration=elapsedMedianMean(a.map(r=>r.durationMs));lines.push(`\n${arm}: cost mean/median ${fmt(cost.mean)}/${fmt(cost.median)}; duration mean/median ${fmt(duration.mean/1000)}/${fmt(duration.median/1000)} s; original oracle ${a.filter(r=>readGrade(root,r.id).originalOracle==='PASS').length}/3; quality mean/range ${quality(a,scores)}.`);}
 if(judge)lines.push(`\nJudge (separate): cost ${judge.usage?.cost==null?'unknown':`$${judge.usage.cost.toFixed(4)}`} equivalent (not invoice); duration ${(judge.durationMs/1000).toFixed(1)}s; status ${judge.status}.`);
 console.log(lines.join('\n'));return lines.join('\n');
}
function waitForRuns(root,timeout=31*60*1000) {
 return new Promise((resolve,reject)=>{
  let watcher,timer;
  const check=()=>{let m;try{m=readJson(path.join(root,'manifest.json'));}catch{return;}if(m.runs.every(r=>r.status==='terminal')){watcher?.close();clearTimeout(timer);resolve();}else if(m.runs.some(r=>['setup_error','infrastructure_error','timeout'].includes(r.status))){watcher?.close();clearTimeout(timer);reject(Error('coding run did not finish; no automatic model retry'));}};
  watcher=fs.watch(path.join(root,'manifest.json'),()=>check());
  timer=setTimeout(()=>{watcher.close();reject(Error('completion receipt wait timed out'));},timeout);check();setImmediate(check);
 });
}
function gradingSourceProof(file) {
 const source=fs.readFileSync(file,'utf8');
 const imports=[...source.matchAll(/(?:\bfrom\s*|\bimport\s*[('" ]|\brequire\s*\()\s*["']([^"']+)/g)].map(m=>m[1]);
 if(imports.some(x=>!x.startsWith('node:'))||/\b(?:eval|Function|exec|execSync|spawnSync|fork)\s*\(/.test(source)||/\bimport\s*\(/.test(source))throw Error('grading source requires manual review; no automatic execution');
 for(const match of source.matchAll(/\bspawn\s*\(\s*([^,]+)/g))if(match[1].trim()!=='process.execPath')throw Error('non-Node child dispatch requires manual source review');
 return {sourceSHA:sha(source),imports,resources:'DISPOSABLE_VERIFIED: grading clone, synthetic fixture roots, private HOME/TMP; sandbox denies external writes, protected reads and all network'};
}
async function finish(root) {
 await waitForRuns(root);
 let m=readJson(path.join(root,'manifest.json'));
 for(const r of m.runs){if(fs.existsSync(path.join(root,'grading',r.id,'receipt.json')))continue;const proof=gradingSourceProof(path.join(root,r.workspace,'scripts/run-tests.mjs'));const receipt=await grade(root,r.id,r.id);receipt.review=proof;json(path.join(root,'grading',r.id,'receipt.json'),receipt);}
 m=readJson(path.join(root,'manifest.json'));if(!m.judges.length)await judge(root);
 const result=report(root);fs.writeFileSync(path.join(root,'REPORT.md'),result+'\n',{mode:0o600});
 json(path.join(root,'completion.json'),{finishedAt:new Date().toISOString(),judge:readJson(path.join(root,'manifest.json')).judges.at(-1)?.status});
}
const fmt=x=>x==null?'unknown':x.toFixed(2);
function quality(a,s){const v=a.map(r=>s?.[r.anonymous]?.total).filter(Number.isFinite);return v.length?`${(v.reduce((x,y)=>x+y,0)/v.length).toFixed(1)}/${Math.min(...v)}–${Math.max(...v)}`:'unknown';}
function argsOf(argv){const o={};for(let i=0;i<argv.length;i++)if(argv[i].startsWith('--'))o[argv[i].slice(2)]=argv[++i];else (o._??=[]).push(argv[i]);return o;}
async function main(){const [cmd,...tail]=process.argv.slice(2),a=argsOf(tail);if(cmd==='prepare'){const out=safeRoot(a.output||path.join(os.tmpdir(),`sol-comparison-${crypto.randomBytes(6).toString('hex')}`));fs.mkdirSync(out,{recursive:true,mode:0o700});setUp(out);console.log(out);}else if(['run','judge','report','grade','all','finish'].includes(cmd)){const root=path.resolve(a.output||'');if(!a.output||!fs.existsSync(path.join(root,'manifest.json')))throw Error('--output must name a prepared comparison root');if(cmd==='finish'){await finish(root);return;}if(cmd==='all'){await run(root);await finish(root);return;}if(cmd==='run')await run(root);if(cmd==='grade'){const id=a.approved;if(!id)throw Error('grade requires --approved <run-id>');console.log(JSON.stringify(await grade(root,id,id),null,2));}if(cmd==='judge'||cmd==='all')await judge(root);if(cmd==='report'||cmd==='all')report(root);}else throw Error('Usage: compare.mjs prepare --output DIR | run|judge|report|all --output DIR | grade --output DIR --approved RUN-ID');}
export { waitForRuns, gradingSourceProof, runCommand, forbiddenDispatch, telemetryExtension, profile, sandboxArgs, isolatedEnv, usageTotals, elapsedMedianMean, diff, blindPayload, anonymousMapping, validateScores, parseFinal, initWorkspace, safeGradeCopy, sandboxProfile, auditRootTranscript };
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
