#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseAndValidateArchitecture } from './validate-architecture.mjs';

const SCRIPT_PLACEHOLDER = '__ARCHITECTURE_DATA__';
const SCRIPT_TAG_RE = /<script\b[^>]*\btype=["']application\/json["'][^>]*>/gi;

export function serializeForDataScript(document) {
  return JSON.stringify(document, null, 2)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function renderArchitectureHtml(document, template) {
  if (typeof template !== 'string') throw new TypeError('architecture template must be text');
  const occurrences = template.split(SCRIPT_PLACEHOLDER).length - 1;
  if (occurrences !== 1) throw new Error(`architecture template must contain exactly one ${SCRIPT_PLACEHOLDER} placeholder`);
  const dataScripts = template.match(SCRIPT_TAG_RE) || [];
  if (dataScripts.length !== 1) throw new Error('architecture template must contain exactly one application/json script element');
  return template.replace(SCRIPT_PLACEHOLDER, serializeForDataScript(document));
}

export async function renderArchitectureFile(inputPath, outputPath, options = {}) {
  const source = await readFile(inputPath, 'utf8');
  const document = parseAndValidateArchitecture(source, inputPath);
  const templatePath = options.templatePath || join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'architecture.html');
  const template = await readFile(templatePath, 'utf8');
  const html = renderArchitectureHtml(document, template);
  const destination = outputPath || join(dirname(resolve(inputPath)), 'architecture.html');
  if (resolve(destination) === resolve(inputPath)) throw new Error('output path must differ from the JSON source path');
  await writeFile(destination, html, 'utf8');
  return { outputPath: destination, html, document };
}

async function main() {
  const [input, output, extra] = process.argv.slice(2);
  if (!input || extra) {
    console.error('Usage: node render-architecture.mjs <architecture.json> [output.html]');
    process.exitCode = 2; return;
  }
  try {
    const result = await renderArchitectureFile(input, output);
    console.log(`Rendered ${result.outputPath}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();
