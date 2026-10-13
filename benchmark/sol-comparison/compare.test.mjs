import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { waitForRuns, parseFinal, runCommand, usageTotals, elapsedMedianMean, diff, blindPayload, anonymousMapping, validateScores, sandboxProfile, auditRootTranscript } from './compare.mjs';
const git=(cwd,...args)=>{const r=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};

// PI waits for EOF on non-TTY stdin before creating its session. Never leave a pipe open.
const eof = await runCommand(process.execPath, ['-e', 'process.stdin.resume();process.stdin.on("end",()=>console.log("EOF"));'], { timeout: 1000 });
assert.equal(eof.code, 0); assert.equal(eof.timedOut, false); assert.match(eof.text, /EOF/);

const input = await runCommand(process.execPath, ['-e', 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>console.log(s));'], { input: 'judge payload', timeout: 1000 });
assert.equal(input.code, 0); assert.match(input.text, /judge payload/);
assert.deepEqual(parseFinal('{"submissions":[]}\nResumo caveman: fim.'), { submissions: [] });

// Only root assistant messages count; latest cumulative top-level completion replaces resumed values.
const usage=(input,cost)=>({input,output:2,cacheRead:3,cacheWrite:1,cost:{total:cost}});
const totals=usageTotals([
 {kind:'root_usage',usage:usage(4,.2)},
 {kind:'tool_result',usage:usage(800,.8)},
 {kind:'subagents:completed',worker:{id:'w1',usage:usage(10,.5)}},
 {kind:'subagents:completed',worker:{id:'w1',usage:usage(15,.7)}}, // resumed/cumulative latest rollup, not another worker
 {kind:'subagents:failed',worker:{id:'w2',usage:usage(3,.1)}},
]);
assert.equal(totals.usage.input,22);assert.equal(totals.usage.output,6);assert.equal(totals.usage.cacheRead,9);assert.equal(totals.usage.cacheWrite,3);assert.ok(Math.abs(totals.usage.cost-1)<1e-9);
assert.equal(totals.workerCount,2);
assert.equal(usageTotals([{kind:'root_usage',usage:null}]).usage,null);
assert.equal(usageTotals([{kind:'root_usage',usage:{input:1,output:2}}]).usage,null);
const unfinished=usageTotals([{kind:'subagents:started',worker:{id:'unfinished',type:'builder',model:null}}]);assert.equal(unfinished.usage,null);assert.equal(unfinished.workerCount,1);
assert.equal(usageTotals([{kind:'subagents:completed',worker:{id:'worker-only',usage:usage(1,.1)}}]).usage,null);

assert.deepEqual(elapsedMedianMean([30,10,20]),{mean:20,median:20});
assert.deepEqual(elapsedMedianMean([10,20]),{mean:15,median:15});
assert.deepEqual(elapsedMedianMean([null,NaN]),{mean:null,median:null});

const root=fs.mkdtempSync(path.join(os.tmpdir(),'sol-compare-unit-'));
try {
  const manifest = path.join(root,'manifest.json');
  fs.writeFileSync(manifest,JSON.stringify({runs:[{status:'launching'}]}));
  const completed = waitForRuns(root,3000);
  fs.writeFileSync(manifest,JSON.stringify({runs:[{status:'terminal'}]}));
  await completed; // Watch the file itself: directory watchers may miss content-only updates.
  fs.writeFileSync(manifest,JSON.stringify({runs:[{status:'launching'}]}));
  const later = waitForRuns(root,3000);
  setTimeout(()=>fs.writeFileSync(manifest,JSON.stringify({runs:[{status:'terminal'}]})),25);
  await later; // Exercise a real notification, not just the deferred initial-state check.
  if(process.platform==='darwin'&&fs.existsSync('/usr/bin/sandbox-exec')){const foreign=fs.mkdtempSync(path.join(os.tmpdir(),'sol-compare-foreign-'));try{const profile=sandboxProfile(root,{denyRoots:[foreign]});assert.ok(profile.includes('(deny file-write*)'));assert.ok(profile.includes(fs.realpathSync(root)));assert.ok(profile.includes(fs.realpathSync(foreign)));assert.ok(profile.includes('(allow file-write* (subpath'));}finally{fs.rmSync(foreign,{recursive:true,force:true});}}
  const session=path.join(root,'session');fs.mkdirSync(session);fs.writeFileSync(path.join(session,'root.jsonl'),JSON.stringify({message:{role:'assistant',content:[{type:'toolCall',name:'Agent',arguments:{subagent_type:'builder'}}]}})+'\n');assert.equal(auditRootTranscript(session,'solo').length,1);assert.equal(auditRootTranscript(session,'orchestrator').length,0);
  const ws=path.join(root,'runs','w1-solo','workspace');fs.mkdirSync(ws,{recursive:true});
  git(ws,'init','--quiet');git(ws,'config','user.name','test');git(ws,'config','user.email','test@localhost');
  fs.writeFileSync(path.join(ws,'tracked.txt'),'base\n');git(ws,'add','tracked.txt');git(ws,'commit','--quiet','-m','base');
  const base=git(ws,'rev-parse','HEAD');fs.writeFileSync(path.join(ws,'tracked.txt'),'changed\n');fs.writeFileSync(path.join(ws,'new.txt'),'new\n');
  const result=diff(root,'w1-solo',base);assert.deepEqual(result.files.sort(),['new.txt','tracked.txt']);assert.match(result.patch,/changed/);assert.match(result.patch,/new/);assert.equal(base,git(ws,'rev-parse','HEAD'));

  const runs=Array.from({length:6},(_,i)=>({id:`w${Math.floor(i/2)+1}-${i%2?'solo':'orchestrator'}`,anonymous:`anon${i}`,contract:'contract',files:['x.js'],patch:'diff',tests:'PASS',arm:'secret'}));
  const payload=blindPayload(runs);assert.equal(payload.length,6);assert.equal(payload[0].id,'anon0');assert.equal(JSON.stringify(payload).includes('orchestrator'),false);assert.equal(JSON.stringify(payload).includes('secret'),false);
  assert.deepEqual(anonymousMapping(runs),Object.fromEntries(runs.map(r=>[r.anonymous,r.id])));
  const scores={submissions:runs.map(r=>({id:r.anonymous,dimensions:['correctness/contract fidelity','robustness/error handling','maintainability/KISS/SoC','scope/safety preservation','test quality'].map(name=>({name,score:20,citation:'file.js:1'}))}))};
  assert.equal(validateScores(scores,runs.map(x=>x.anonymous)).get('anon5').total,100);
  assert.throws(()=>validateScores({submissions:scores.submissions.slice(1)},runs.map(x=>x.anonymous)),/cover/);
  assert.throws(()=>validateScores({submissions:scores.submissions.map((x,i)=>i?x:{...x,dimensions:x.dimensions.map(d=>({...d,score:21}))})},runs.map(x=>x.anonymous)),/score/);
} finally { fs.rmSync(root,{recursive:true,force:true}); }
console.log('compare tests passed (synthetic git root; owned root removed)');
