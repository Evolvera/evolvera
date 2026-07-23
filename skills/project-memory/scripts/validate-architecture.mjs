#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const CONFIDENCE = ['known', 'inferred', 'unknown'];
export const COMPONENT_KINDS = ['actor-facing', 'client', 'domain', 'service', 'worker', 'datastore', 'queue', 'external', 'build', 'deploy', 'library'];
export const RELATIONSHIP_KINDS = ['uses', 'calls', 'reads', 'writes', 'publishes', 'subscribes', 'contains', 'depends-on', 'builds', 'deploys', 'observes', 'authenticates'];
export const FLOW_TYPES = ['user', 'data', 'runtime', 'build', 'deploy', 'failure'];
export const GAP_STATUSES = ['open', 'resolved', 'accepted'];

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEAD_RE = /^(?:[0-9a-f]{40}|UNKNOWN)$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ABSOLUTE_RE = /^(?:\/|\\|[A-Za-z]:[\\/]|[a-zA-Z][a-zA-Z+.-]*:)/;

function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function add(errors, path, message) { errors.push(`${path}: ${message}`); }
function requiredString(value, path, errors, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) add(errors, path, 'must be a non-empty string');
}
function optionalString(value, path, errors) { if (value !== undefined && typeof value !== 'string') add(errors, path, 'must be a string when present'); }
function array(value, path, errors) { if (!Array.isArray(value)) { add(errors, path, 'must be an array'); return []; } return value; }
function stringArray(value, path, errors) {
  return array(value, path, errors).filter((item, index) => {
    if (typeof item !== 'string' || !item.trim()) { add(errors, `${path}[${index}]`, 'must be a non-empty string'); return false; }
    return true;
  });
}
function enumValue(value, allowed, path, errors) { if (!allowed.includes(value)) add(errors, path, `must be one of: ${allowed.join(', ')}`); }
function id(value, path, errors) { requiredString(value, path, errors); if (typeof value === 'string' && !ID_RE.test(value)) add(errors, path, 'must be a stable kebab-case ID'); }
function timestamp(value, path, errors) {
  if (typeof value !== 'string' || !ISO_RE.test(value) || Number.isNaN(Date.parse(value))) add(errors, path, 'must be an ISO UTC timestamp (for example 2026-01-30T12:00:00.000Z)');
}
function sourceHead(value, path, errors) { if (typeof value !== 'string' || !HEAD_RE.test(value)) add(errors, path, 'must be UNKNOWN or a lowercase 40-hex commit'); }
function confidence(value, path, errors) { enumValue(value, CONFIDENCE, path, errors); }
function objectAt(value, path, errors) { if (!isObject(value)) { add(errors, path, 'must be an object'); return {}; } return value; }
function refs(values, path, valid, errors) {
  for (const [index, ref] of stringArray(values, path, errors).entries()) if (!valid.has(ref)) add(errors, `${path}[${index}]`, `references missing ID "${ref}"`);
}
function factEvidence(item, path, errors) {
  if ((item.confidence === 'known' || item.confidence === 'inferred') && (!Array.isArray(item.evidenceIds) || item.evidenceIds.length === 0)) {
    add(errors, `${path}.evidenceIds`, `${item.confidence} facts require supporting evidence; use confidence "unknown" otherwise`);
  }
}

export function validateArchitecture(document) {
  const errors = [];
  const root = objectAt(document, '$', errors);
  if (root.schemaVersion !== 1) add(errors, '$.schemaVersion', 'must equal 1');

  const project = objectAt(root.project, '$.project', errors);
  id(project.id, '$.project.id', errors);
  requiredString(project.name, '$.project.name', errors);
  optionalString(project.description, '$.project.description', errors);
  optionalString(project.repository, '$.project.repository', errors);

  const snapshot = objectAt(root.snapshot, '$.snapshot', errors);
  sourceHead(snapshot.sourceHead, '$.snapshot.sourceHead', errors);
  timestamp(snapshot.generatedAt, '$.snapshot.generatedAt', errors);
  timestamp(snapshot.lastVerifiedAt, '$.snapshot.lastVerifiedAt', errors);
  requiredString(snapshot.scope, '$.snapshot.scope', errors);
  confidence(snapshot.confidence, '$.snapshot.confidence', errors);

  const actors = array(root.actors, '$.actors', errors);
  const components = array(root.components, '$.components', errors);
  const dataObjects = array(root.dataObjects, '$.dataObjects', errors);
  const relationships = array(root.relationships, '$.relationships', errors);
  const flows = array(root.flows, '$.flows', errors);
  const evidence = array(root.evidence, '$.evidence', errors);
  const gaps = array(root.gaps, '$.gaps', errors);

  const allIds = new Map();
  const register = (value, path) => {
    id(value, `${path}.id`, errors);
    if (typeof value !== 'string') return;
    if (allIds.has(value)) add(errors, `${path}.id`, `duplicate ID "${value}"; first used at ${allIds.get(value)}`);
    else allIds.set(value, path);
  };
  actors.forEach((item, i) => register(objectAt(item, `$.actors[${i}]`, errors).id, `$.actors[${i}]`));
  components.forEach((item, i) => register(objectAt(item, `$.components[${i}]`, errors).id, `$.components[${i}]`));
  dataObjects.forEach((item, i) => register(objectAt(item, `$.dataObjects[${i}]`, errors).id, `$.dataObjects[${i}]`));
  relationships.forEach((item, i) => register(objectAt(item, `$.relationships[${i}]`, errors).id, `$.relationships[${i}]`));
  flows.forEach((item, i) => register(objectAt(item, `$.flows[${i}]`, errors).id, `$.flows[${i}]`));
  evidence.forEach((item, i) => register(objectAt(item, `$.evidence[${i}]`, errors).id, `$.evidence[${i}]`));
  gaps.forEach((item, i) => register(objectAt(item, `$.gaps[${i}]`, errors).id, `$.gaps[${i}]`));
  flows.forEach((flow, i) => array(flow?.steps, `$.flows[${i}].steps`, errors).forEach((step, j) => register(objectAt(step, `$.flows[${i}].steps[${j}]`, errors).id, `$.flows[${i}].steps[${j}]`)));

  const actorIds = new Set(actors.map(x => x?.id).filter(Boolean));
  const componentIds = new Set(components.map(x => x?.id).filter(Boolean));
  const dataIds = new Set(dataObjects.map(x => x?.id).filter(Boolean));
  const entityIds = new Set([...actorIds, ...componentIds, ...dataIds]);
  const relationshipIds = new Set(relationships.map(x => x?.id).filter(Boolean));
  const evidenceIds = new Set(evidence.map(x => x?.id).filter(Boolean));

  actors.forEach((value, i) => {
    const path = `$.actors[${i}]`, item = objectAt(value, path, errors);
    requiredString(item.name, `${path}.name`, errors); requiredString(item.kind, `${path}.kind`, errors);
    optionalString(item.description, `${path}.description`, errors); confidence(item.confidence, `${path}.confidence`, errors);
    refs(item.evidenceIds, `${path}.evidenceIds`, evidenceIds, errors); factEvidence(item, path, errors);
  });
  components.forEach((value, i) => {
    const path = `$.components[${i}]`, item = objectAt(value, path, errors);
    requiredString(item.name, `${path}.name`, errors); enumValue(item.kind, COMPONENT_KINDS, `${path}.kind`, errors);
    optionalString(item.description, `${path}.description`, errors); optionalString(item.parentId, `${path}.parentId`, errors);
    if (!Number.isInteger(item.level) || item.level < 0 || item.level > 3) add(errors, `${path}.level`, 'must be an integer from 0 through 3');
    confidence(item.confidence, `${path}.confidence`, errors); refs(item.evidenceIds, `${path}.evidenceIds`, evidenceIds, errors); factEvidence(item, path, errors);
    if (item.parentId !== undefined && !componentIds.has(item.parentId)) add(errors, `${path}.parentId`, `references missing component "${item.parentId}"`);
    if (item.parentId === undefined && Number.isInteger(item.level) && item.level !== 0) add(errors, `${path}.level`, 'root components without parentId must use level 0');
  });
  const componentById = new Map(components.map(item => [item?.id, item]));
  components.forEach((item, i) => {
    if (!item?.parentId || !componentById.has(item.parentId)) return;
    const parent = componentById.get(item.parentId);
    if (Number.isInteger(item.level) && Number.isInteger(parent.level) && item.level !== parent.level + 1) add(errors, `$.components[${i}].level`, `must equal parent level + 1 (${parent.level + 1})`);
    const seen = new Set([item.id]); let cursor = item;
    while (cursor?.parentId) {
      if (seen.has(cursor.parentId)) { add(errors, `$.components[${i}].parentId`, 'creates a component parent cycle'); break; }
      seen.add(cursor.parentId); cursor = componentById.get(cursor.parentId);
    }
  });
  dataObjects.forEach((value, i) => {
    const path = `$.dataObjects[${i}]`, item = objectAt(value, path, errors);
    requiredString(item.name, `${path}.name`, errors); requiredString(item.kind, `${path}.kind`, errors); optionalString(item.description, `${path}.description`, errors);
    confidence(item.confidence, `${path}.confidence`, errors); refs(item.ownerIds, `${path}.ownerIds`, componentIds, errors); refs(item.evidenceIds, `${path}.evidenceIds`, evidenceIds, errors); factEvidence(item, path, errors);
  });
  evidence.forEach((value, i) => {
    const path = `$.evidence[${i}]`, item = objectAt(value, path, errors);
    requiredString(item.path, `${path}.path`, errors); requiredString(item.claim, `${path}.claim`, errors); optionalString(item.symbol, `${path}.symbol`, errors);
    if (typeof item.path === 'string') {
      const parts = item.path.replace(/\\/g, '/').split('/');
      if (ABSOLUTE_RE.test(item.path) || parts.includes('..')) add(errors, `${path}.path`, 'must be a repository-relative path without traversal');
    }
    if (item.sourceHead !== undefined) sourceHead(item.sourceHead, `${path}.sourceHead`, errors);
    for (const key of ['startLine', 'endLine']) if (item[key] !== undefined && (!Number.isInteger(item[key]) || item[key] < 1)) add(errors, `${path}.${key}`, 'must be a positive integer when present');
    if (item.endLine !== undefined && item.startLine === undefined) add(errors, `${path}.startLine`, 'is required when endLine is present');
    if (Number.isInteger(item.startLine) && Number.isInteger(item.endLine) && item.endLine < item.startLine) add(errors, `${path}.endLine`, 'must be greater than or equal to startLine');
  });
  relationships.forEach((value, i) => {
    const path = `$.relationships[${i}]`, item = objectAt(value, path, errors);
    requiredString(item.name, `${path}.name`, errors); enumValue(item.kind, RELATIONSHIP_KINDS, `${path}.kind`, errors);
    id(item.fromId, `${path}.fromId`, errors); id(item.toId, `${path}.toId`, errors);
    if (!entityIds.has(item.fromId)) add(errors, `${path}.fromId`, `references missing actor/component/data ID "${item.fromId}"`);
    if (!entityIds.has(item.toId)) add(errors, `${path}.toId`, `references missing actor/component/data ID "${item.toId}"`);
    optionalString(item.description, `${path}.description`, errors); optionalString(item.protocol, `${path}.protocol`, errors);
    refs(item.dataObjectIds, `${path}.dataObjectIds`, dataIds, errors); refs(item.evidenceIds, `${path}.evidenceIds`, evidenceIds, errors);
    confidence(item.confidence, `${path}.confidence`, errors); factEvidence(item, path, errors);
  });
  flows.forEach((value, i) => {
    const path = `$.flows[${i}]`, item = objectAt(value, path, errors);
    requiredString(item.name, `${path}.name`, errors); enumValue(item.type, FLOW_TYPES, `${path}.type`, errors); optionalString(item.description, `${path}.description`, errors);
    refs(item.actorIds, `${path}.actorIds`, actorIds, errors); refs(item.entrypointIds, `${path}.entrypointIds`, componentIds, errors);
    stringArray(item.outcomes, `${path}.outcomes`, errors); stringArray(item.failureModes, `${path}.failureModes`, errors);
    refs(item.evidenceIds, `${path}.evidenceIds`, evidenceIds, errors); confidence(item.confidence, `${path}.confidence`, errors); factEvidence(item, path, errors);
    const steps = array(item.steps, `${path}.steps`, errors), orders = [];
    steps.forEach((valueStep, j) => {
      const stepPath = `${path}.steps[${j}]`, step = objectAt(valueStep, stepPath, errors);
      if (!Number.isInteger(step.order) || step.order < 1) add(errors, `${stepPath}.order`, 'must be a positive integer'); else orders.push(step.order);
      requiredString(step.action, `${stepPath}.action`, errors); optionalString(step.input, `${stepPath}.input`, errors); optionalString(step.output, `${stepPath}.output`, errors); optionalString(step.stateChange, `${stepPath}.stateChange`, errors);
      refs(step.componentIds, `${stepPath}.componentIds`, componentIds, errors); refs(step.relationshipIds, `${stepPath}.relationshipIds`, relationshipIds, errors); refs(step.dataObjectIds, `${stepPath}.dataObjectIds`, dataIds, errors);
    });
    const sorted = [...orders].sort((a, b) => a - b);
    if (new Set(orders).size !== orders.length) add(errors, `${path}.steps`, 'step order values must be unique');
    if (sorted.some((order, index) => order !== index + 1)) add(errors, `${path}.steps`, 'step order must be contiguous starting at 1');
  });
  gaps.forEach((value, i) => {
    const path = `$.gaps[${i}]`, item = objectAt(value, path, errors);
    requiredString(item.title, `${path}.title`, errors); enumValue(item.status, GAP_STATUSES, `${path}.status`, errors);
    requiredString(item.impact, `${path}.impact`, errors); requiredString(item.question, `${path}.question`, errors); refs(item.evidenceIds, `${path}.evidenceIds`, evidenceIds, errors);
  });

  return { valid: errors.length === 0, errors };
}

export function assertValidArchitecture(document, label = 'architecture JSON') {
  if (typeof document === 'string' && /<\s*!?doctype\s+html|<\s*html[\s>]/i.test(document)) throw new Error(`${label}: HTML is not accepted as architecture source input`);
  const result = validateArchitecture(document);
  if (!result.valid) throw new Error(`${label} is invalid:\n- ${result.errors.join('\n- ')}`);
  return document;
}

export function parseAndValidateArchitecture(source, label = 'architecture JSON') {
  if (typeof source !== 'string') throw new TypeError(`${label}: source must be text`);
  if (/<\s*!?doctype\s+html|<\s*html[\s>]/i.test(source)) throw new Error(`${label}: HTML is not accepted as architecture source input`);
  let document;
  try { document = JSON.parse(source); } catch (error) { throw new Error(`${label}: invalid JSON (${error.message})`); }
  return assertValidArchitecture(document, label);
}

async function main() {
  const input = process.argv[2];
  if (!input || process.argv.length > 3) {
    console.error('Usage: node validate-architecture.mjs <architecture.json>');
    process.exitCode = 2; return;
  }
  try {
    const source = await readFile(input, 'utf8');
    const document = parseAndValidateArchitecture(source, input);
    const count = ['actors', 'components', 'dataObjects', 'relationships', 'flows', 'evidence', 'gaps'].reduce((sum, key) => sum + document[key].length, 0);
    console.log(`Valid architecture schema v${document.schemaVersion}: ${count} records`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();
