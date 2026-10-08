#!/usr/bin/env node
// Contract smoke test for the canonical design vocabulary and its references.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const vocabRel = 'skills/design-catalog/DESIGN_VOCABULARY.md';
assert.ok(fs.existsSync(path.join(root, vocabRel)), 'vocabulary file exists');
const vocab = read(vocabRel);

// 17 field headings, in order.
const fields = [
  'Layout & Grid', 'Hero', 'Content Sections', 'Navigation', 'Scroll Behavior',
  'Motion & Transitions', 'Feedback, States & Microinteractions', 'Typography', 'Color',
  'Surface & Visual Style', 'Imagery & Iconography', 'Components', 'Forms & Input',
  'Data Visualization', 'Responsive Strategy', 'Accessibility Baseline',
  'Content Hierarchy & Scanning',
];
const headings = [...vocab.matchAll(/^## (\d+)\. (.+)$/gm)].map((m) => [Number(m[1]), m[2].trim()]);
assert.deepEqual(headings, fields.map((f, i) => [i + 1, f]), 'field headings present, numbered, in order');

// Scroll Behavior terms.
const start = vocab.indexOf('## 5. Scroll Behavior');
const end = vocab.indexOf('## 6. ', start);
const scroll = vocab.slice(start, end);
for (const term of ['Scroll-triggered', 'Scroll-linked', 'Parallax', 'Sticky', 'Scroll Snap', 'Horizontal Scroll']) {
  assert.ok(scroll.includes(`**${term}**`), `Scroll Behavior defines ${term}`);
}

// Creative-catalog slugs exist.
const index = JSON.parse(read('skills/creative-catalog/creative-index.json'));
const known = new Set(index.patterns.map((p) => p.slug));
const slugs = new Set([...vocab.matchAll(/creative-catalog `([a-z0-9-]+)`/g)].map((m) => m[1]));
for (const required of ['parallax-depth', 'scroll-gallery', 'scrollytelling', 'media-scrub', 'kinetic-type']) {
  assert.ok(slugs.has(required), `vocabulary maps ${required}`);
}
for (const slug of slugs) assert.ok(known.has(slug), `creative-catalog slug exists: ${slug}`);

// Selection table header in the protocol.
assert.ok(vocab.includes('## Design Vocabulary Selection'), 'selection heading string in protocol');
assert.ok(vocab.includes('| Field | Term | Fit | Rejected alternative | Guardrail |'), 'selection table header in protocol');

// Consumers reference the vocabulary.
const consumers = [
  'website-designer', 'website-home-designer', 'website-home-planner', 'website-polisher',
  'website-polisher-home', 'website-creative', 'builder-design', 'builder-heavy-design',
  'builder-home', 'validator-home',
].map((n) => `agents/${n}.md`).concat([
  'skills/website-pipeline/SKILL.md', 'skills/website-home-preview/SKILL.md', 'skills/design-catalog/SKILL.md',
]);
for (const rel of consumers) {
  const text = read(rel);
  assert.ok(text.includes('DESIGN_VOCABULARY.md'), `${rel} references DESIGN_VOCABULARY.md`);
  assert.ok(/^---\n[\s\S]*?\n---\n/.test(text), `${rel} frontmatter intact`);
}

// Hover reveal: canonical term and emphasis in every visual consumer.
const motion = vocab.slice(vocab.indexOf('## 6. Motion & Transitions'), vocab.indexOf('## 7. '));
assert.ok(motion.includes('**Hover reveal**') && motion.includes('@media (hover: none)'), 'Motion defines Hover reveal with touch fallback');
for (const n of ['website-designer', 'website-home-designer', 'website-home-planner', 'builder-design', 'builder-heavy-design', 'builder-home', 'website-polisher', 'website-polisher-home']) {
  const text = read(`agents/${n}.md`);
  assert.ok(text.includes('**Hover reveal (emphasis):**') && text.includes('second-order elements'), `${n} emphasizes Hover reveal on second-order elements`);
}

console.log('design-vocabulary smoke: PASS');
