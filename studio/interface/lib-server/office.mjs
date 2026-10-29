// Previews of Office files inside the Studio, without any dependency: .xlsx/.xlsm as tables (first sheets, capped),
// .docx as headings, paragraphs and tables, .pptx as slides with their text. An Office file is a ZIP of XML parts, read
// here with Node's own zlib. Caps on entries and inflated size keep a hostile file from eating memory.
import { inflateRawSync } from "node:zlib";

const ZIP_MAX_ENTRIES = 5000;
const PART_MAX_BYTES = 32 * 1024 * 1024;

// The parts of a ZIP buffer: Map name -> () => Buffer (inflated on demand).
export function readZip(buffer) {
  const minEocd = Math.max(0, buffer.length - 65_557);
  let eocd = -1;
  for (let index = buffer.length - 22; index >= minEocd; index--) {
    if (buffer.readUInt32LE(index) === 0x06054b50) { eocd = index; break; }
  }
  if (eocd < 0) throw new Error("Não é um arquivo do Office válido (ZIP sem diretório)");
  const count = buffer.readUInt16LE(eocd + 10);
  if (count > ZIP_MAX_ENTRIES) throw new Error("Arquivo com partes demais");
  let offset = buffer.readUInt32LE(eocd + 16);
  const parts = new Map();
  for (let entry = 0; entry < count; entry++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Diretório do ZIP corrompido");
    const method = buffer.readUInt16LE(offset + 10);
    const compressed = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    parts.set(name, () => {
      if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error(`Parte corrompida: ${name}`);
      const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
      const data = buffer.subarray(start, start + compressed);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data, { maxOutputLength: PART_MAX_BYTES });
      throw new Error(`Compressão não suportada (${method}) em ${name}`);
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return parts;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export const xmlText = (value) => String(value ?? "").replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, code) => {
  if (code[0] === "#") return String.fromCodePoint(code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10));
  return ENTITIES[code] ?? whole;
});
const part = (parts, name) => parts.get(name)?.().toString("utf8") ?? null;
const attr = (tag, name) => xmlText(new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? "");
// Every <t ...>text</t> (any namespace prefix) inside a fragment, joined.
const texts = (fragment, prefix) => [...String(fragment).matchAll(new RegExp(`<${prefix}:t(?:\\s[^>]*)?>([\\s\\S]*?)</${prefix}:t>`, "g"))].map((match) => xmlText(match[1])).join("");

// "BC12" -> column index 54 (0-based).
export function columnIndex(ref) {
  let index = 0;
  for (const char of /^[A-Z]+/.exec(ref)?.[0] ?? "A") index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

export function xlsxPreview(buffer, { maxSheets = 8, maxRows = 300, maxCols = 40 } = {}) {
  const parts = readZip(buffer);
  const workbook = part(parts, "xl/workbook.xml");
  if (!workbook) throw new Error("Planilha sem xl/workbook.xml");
  const rels = new Map([...(part(parts, "xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b[^>]*>/g)].map(([tag]) => [attr(tag, "Id"), attr(tag, "Target")]));
  const plainTexts = (fragment) => [...String(fragment).matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => xmlText(t[1])).join("");
  const shared = [...(part(parts, "xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => plainTexts(match[1]));
  const sheets = [];
  const all = [...workbook.matchAll(/<sheet\b[^>]*>/g)];
  for (const [tag] of all.slice(0, maxSheets)) {
    const target = rels.get(attr(tag, "r:id")) ?? "";
    const name = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    const xml = part(parts, name) ?? "";
    const rows = [];
    let width = 0;
    let truncatedRows = false;
    for (const row of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
      // Rows keep their real number (r="7"): empty rows before it are filled, so B2 stays on line 2.
      const number = Number(attr(`<row ${row[1] ?? row[3] ?? ""}>`, "r")) || rows.length + 1;
      if (number > maxRows) { truncatedRows = true; break; }
      while (rows.length < number - 1) rows.push([]);
      const cells = [];
      for (const cell of (row[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const column = columnIndex(attr(`<c ${cell[1]}>`, "r"));
        if (column >= maxCols) continue;
        const type = attr(`<c ${cell[1]}>`, "t");
        const inner = cell[2] ?? "";
        const raw = xmlText(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
        // A formula saved without its result (files written by scripts) shows the formula itself.
        const formula = xmlText(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/.exec(inner)?.[1] ?? "");
        const value = type === "s" ? shared[Number(raw)] ?? "" : type === "inlineStr" ? plainTexts(inner) : type === "b" ? (raw === "1" ? "VERDADEIRO" : "FALSO") : raw || (formula ? `=${formula}` : "");
        cells[column] = value;
        width = Math.max(width, column + 1);
      }
      rows.push(cells);
    }
    sheets.push({ name: attr(tag, "name"), rows: rows.map((cells) => Array.from({ length: width }, (_, index) => cells[index] ?? "")), truncatedRows });
  }
  return { kind: "xlsx", sheets, moreSheets: Math.max(0, all.length - maxSheets) };
}

export function docxPreview(buffer, { maxBlocks = 600 } = {}) {
  const document = part(readZip(buffer), "word/document.xml");
  if (!document) throw new Error("Documento sem word/document.xml");
  const body = /<w:body>([\s\S]*)<\/w:body>/.exec(document)?.[1] ?? document;
  const blocks = [];
  for (const match of body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g)) {
    if (blocks.length >= maxBlocks) break;
    const xml = match[0];
    if (xml.startsWith("<w:tbl>")) {
      blocks.push({ type: "table", rows: [...xml.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].slice(0, 200).map(([row]) => [...row.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(([cell]) => texts(cell, "w"))) });
      continue;
    }
    const text = texts(xml, "w");
    const style = attr(/<w:pStyle\b[^>]*>/.exec(xml)?.[0] ?? "", "w:val");
    // Built-in heading styles are "Heading1".."Heading9" in any language's file; "Title" counts as level 1.
    const level = Number(/^Heading(\d)/i.exec(style)?.[1] ?? (/^Title$/i.test(style) ? 1 : 0));
    if (text.trim() || level) blocks.push({ type: level ? "heading" : "paragraph", level, text });
  }
  return { kind: "docx", blocks };
}

export function pptxPreview(buffer, { maxSlides = 80 } = {}) {
  const parts = readZip(buffer);
  const slideNumber = (name) => Number(/slide(\d+)\.xml$/.exec(name)[1]);
  const names = [...parts.keys()].filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => slideNumber(a) - slideNumber(b));
  const slides = names.slice(0, maxSlides).map((name) => {
    const lines = [...(part(parts, name) ?? "").matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((match) => texts(match[1], "a")).filter((line) => line.trim());
    return { title: lines[0] ?? "", lines: lines.slice(1, 40) };
  });
  return { kind: "pptx", slides, moreSlides: Math.max(0, names.length - maxSlides) };
}

export function officePreview(name, buffer) {
  const ext = String(name).toLowerCase().split(".").pop();
  if (ext === "xlsx" || ext === "xlsm") return xlsxPreview(buffer);
  if (ext === "docx") return docxPreview(buffer);
  if (ext === "pptx") return pptxPreview(buffer);
  throw new Error("Sem prévia para este formato; use Abrir no app.");
}
