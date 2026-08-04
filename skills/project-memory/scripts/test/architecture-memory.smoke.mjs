#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertValidArchitecture, parseAndValidateArchitecture, validateArchitecture } from '../validate-architecture.mjs';
import { renderArchitectureFile } from '../render-architecture.mjs';

const scriptDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const skillDir = resolve(scriptDir, '..');
const starterPath = join(skillDir, 'templates', 'architecture.json');
const temp = await mkdtemp(join(tmpdir(), 'architecture-memory-smoke-'));
let assertions = 0;
function check(value, message) { assert.ok(value, message); assertions++; }
function clone(value) { return structuredClone(value); }
function expectInvalid(value, fragment) {
  const result = validateArchitecture(value);
  check(!result.valid, `fixture should fail: ${fragment}`);
  check(result.errors.some(error => error.includes(fragment)), `expected actionable error containing "${fragment}", got:\n${result.errors.join('\n')}`);
}

function richerFixture() {
  const ev = [{ id:'source-evidence', path:'src/architecture.mjs', symbol:'createArchitecture', startLine:10, endLine:42, sourceHead:'0123456789abcdef0123456789abcdef01234567', claim:'The source declares the represented architecture surfaces.' }];
  const components = [
    ['product-domain','Product domain','domain',0],['web-application','Web application','client',1,'product-domain'],['request-module','Request module','service',2,'web-application'],['request-endpoint','Request endpoint','actor-facing',3,'request-module'],
    ['runtime-service','Runtime service','service',1,'product-domain'],['runtime-worker','Runtime worker','worker',2,'runtime-service'],['event-handler','Event handler','worker',3,'runtime-worker'],
    ['data-store','Data store','datastore',1,'product-domain'],['build-pipeline','Build pipeline','build',1,'product-domain'],['deploy-target','Deploy target','deploy',1,'product-domain'],['external-api','External API','external',0]
  ].map(([id,name,kind,level,parentId])=>({id,name,kind,level,...(parentId?{parentId}:{}),confidence:'known',evidenceIds:['source-evidence']}));
  const actors=[{id:'product-user',name:'Product user',kind:'person',description:'Initiates the represented user flow.',confidence:'known',evidenceIds:['source-evidence']}];
  const dataObjects=[{id:'request-record',name:'Request record',kind:'record',ownerIds:['data-store'],confidence:'known',evidenceIds:['source-evidence']}];
  const relSpecs=[
    ['user-opens-app','User opens application','uses','product-user','web-application'],['app-calls-endpoint','Application calls endpoint','calls','web-application','request-endpoint'],['endpoint-calls-runtime','Endpoint calls runtime','calls','request-endpoint','runtime-service'],['runtime-writes-record','Runtime writes record','writes','runtime-service','request-record'],['store-holds-record','Store holds record','contains','data-store','request-record'],['runtime-publishes-work','Runtime publishes work','publishes','runtime-service','runtime-worker'],['pipeline-builds-app','Pipeline builds application','builds','build-pipeline','web-application'],['pipeline-deploys-target','Pipeline deploys target','deploys','build-pipeline','deploy-target'],['runtime-calls-external','Runtime calls external API','calls','runtime-service','external-api']
  ];
  const relationships=relSpecs.map(([id,name,kind,fromId,toId])=>({id,name,kind,fromId,toId,protocol:kind==='calls'?'HTTPS':undefined,dataObjectIds:id.includes('record')?['request-record']:[],evidenceIds:['source-evidence'],confidence:'known'}));
  const specs=[
    ['user-request','User request','user',['user-opens-app','app-calls-endpoint'],['web-application','request-endpoint']],
    ['record-persistence','Record persistence','data',['runtime-writes-record','store-holds-record'],['runtime-service','data-store']],
    ['runtime-processing','Runtime processing','runtime',['endpoint-calls-runtime','runtime-publishes-work'],['runtime-service','runtime-worker']],
    ['application-build','Application build','build',['pipeline-builds-app'],['build-pipeline','web-application']],
    ['target-deployment','Target deployment','deploy',['pipeline-deploys-target'],['build-pipeline','deploy-target']],
    ['external-failure','External dependency failure','failure',['runtime-calls-external'],['runtime-service','external-api']]
  ];
  const flows=specs.map(([id,name,type,rels,ids])=>({id,name,type,actorIds:type==='user'?['product-user']:[],entrypointIds:[ids[0]],steps:rels.map((relationshipId,index)=>({id:`${id}-step-${index+1}`,order:index+1,action:`Execute ${relationshipId}`,componentIds:ids.filter(x=>components.some(c=>c.id===x)),relationshipIds:[relationshipId],dataObjectIds:type==='data'?['request-record']:[],...(index===0?{input:'validated input'}:{output:'observable result'}),stateChange:type==='data'?'Record state advances.':undefined})),outcomes:[`${name} completes.`],failureModes:type==='failure'?['External dependency is unavailable.']:[],evidenceIds:['source-evidence'],confidence:'known'}));
  return {schemaVersion:1,project:{id:'fixture-project',name:'Fixture Project',description:'A grounded smoke-test map.'},snapshot:{sourceHead:'0123456789abcdef0123456789abcdef01234567',generatedAt:'2026-07-18T12:00:00.000Z',lastVerifiedAt:'2026-07-18T12:00:00.000Z',scope:'Smoke fixture',confidence:'known'},actors,components,dataObjects,relationships,flows,evidence:ev,gaps:[{id:'open-runtime-question',title:'Runtime timeout remains to verify',status:'open',impact:'Failure timing is not represented.',question:'Where is the timeout configured?',evidenceIds:['source-evidence']}]};
}

try {
  const starterSource = await readFile(starterPath, 'utf8');
  const starter = parseAndValidateArchitecture(starterSource, 'starter architecture');
  check(starter.schemaVersion === 1, 'starter JSON validates');

  const rich = richerFixture();
  assertValidArchitecture(rich, 'rich fixture'); assertions++;
  const richPath = join(temp, 'architecture.json'), htmlA = join(temp, 'architecture-a.html'), htmlB = join(temp, 'architecture-b.html');
  await writeFile(richPath, JSON.stringify(rich, null, 2));
  const first = await renderArchitectureFile(richPath, htmlA);
  const html = first.html;
  for (const tab of ['Overview','Architecture','User Flows','Data Flows','Runtime','Delivery','Evidence & Gaps']) check(html.includes(`>${tab}<`), `HTML contains ${tab} tab`);
  for (const control of ['zoom-out','zoom-in','fit','reset','lod','minimap']) check(html.includes(`id="${control}"`), `HTML contains ${control} semantic-zoom control`);
  check((html.match(/type="application\/json"/g)||[]).length===1,'HTML has exactly one embedded JSON data element');
  check(html.includes('"fixture-project"'),'HTML embeds full architecture JSON');
  check(!/(?:src|href)=["'](?:https?:)?\/\//i.test(html)&&!/@import\s+url/i.test(html),'HTML has no external assets');
  check(!html.includes('__ARCHITECTURE_DATA__'),'HTML has no unresolved data placeholder');
  check(html.includes('visibleGraph')&&html.includes('are grouped while showing'),'HTML includes semantic disclosure and visible-budget notice');
  check(html.includes('__selected_path_overflow__')&&html.includes('represented by one aggregate'),'HTML keeps selected paths within budget through explicit aggregation');
  for (const control of ['context-bar','breadcrumbs','context-title','context-up']) check(html.includes(`id="${control}"`), `HTML contains ${control} focus-context control`);
  for (const marker of ['focusId','drillInto','upContext','hitTestComponent','SEMANTIC_DRILL_THRESHOLD','DRILL_COOLDOWN_MS']) check(html.includes(marker), `HTML contains ${marker} semantic navigation marker`);
  check(html.includes('Double-click a subsystem to enter')&&html.includes('Esc to go up'),'HTML includes drill-in and drill-out onboarding');
  check(html.includes('animateViewport')&&html.includes('.stage.animating .graph #viewport'),'HTML separates smooth explicit transitions from wheel and drag transforms');
  check(!/\bfetch\s*\(|\.innerHTML\s*=|\beval\s*\(/.test(html),'HTML adds no fetch, innerHTML, or eval execution surface');

  const hostile=clone(rich);hostile.project.description='safe prefix </script><script>globalThis.pwned=true</script> suffix';
  const hostilePath=join(temp,'hostile.json'),hostileOut=join(temp,'hostile.html');await writeFile(hostilePath,JSON.stringify(hostile));const hostileHtml=(await renderArchitectureFile(hostilePath,hostileOut)).html;
  const dataMatch=hostileHtml.match(/<script type="application\/json" id="architecture-data">([\s\S]*?)<\/script>/);
  check(Boolean(dataMatch),'hostile render retains one bounded data script');
  check(!dataMatch[1].includes('</script>')&&!hostileHtml.includes('<script>globalThis.pwned'),'literal closing script is escaped');
  check(JSON.parse(dataMatch[1]).project.description===hostile.project.description,'escaped payload round-trips exactly');

  const duplicate=clone(rich);duplicate.components[0].id=duplicate.actors[0].id;expectInvalid(duplicate,'duplicate ID');
  const dangling=clone(rich);dangling.relationships[0].toId='missing-surface';expectInvalid(dangling,'references missing');
  const cycle=clone(rich);cycle.components[0].parentId='request-module';cycle.components[0].level=3;expectInvalid(cycle,'parent cycle');
  const badLevel=clone(rich);badLevel.components.find(x=>x.id==='request-module').level=3;expectInvalid(badLevel,'parent level + 1');
  const steps=clone(rich);steps.flows[0].steps[1].order=3;expectInvalid(steps,'contiguous');
  const absolute=clone(rich);absolute.evidence[0].path='/etc/passwd';expectInvalid(absolute,'repository-relative path');
  const traversal=clone(rich);traversal.evidence[0].path='src/../../secret';expectInvalid(traversal,'repository-relative path');

  const invalidPath=join(temp,'invalid.json');await writeFile(invalidPath,JSON.stringify(dangling));await assert.rejects(()=>renderArchitectureFile(invalidPath,join(temp,'invalid.html')),/invalid|references missing/);assertions++;
  await renderArchitectureFile(richPath,htmlB);check(await readFile(htmlA,'utf8')===await readFile(htmlB,'utf8'),'renderer output is deterministic for identical input');
  check(rich.snapshot.generatedAt==='2026-07-18T12:00:00.000Z','renderer does not mutate timestamps');

  console.log(`architecture-memory smoke: PASS (${assertions} assertions)`);
} finally {
  await rm(temp,{recursive:true,force:true});
}
