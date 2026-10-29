// Office previews and the file viewer helpers. The ZIPs are built here (deflate + stored), no fixture files, no Python.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { columnIndex, docxPreview, officePreview, pptxPreview, readZip, xlsxPreview, xmlText } from "../lib-server/office.mjs";
import { fileInfo, guessDelimiter, parseDelimited } from "../public/lib.js";
import { systemOpenCommand } from "../server.mjs";

// A minimal ZIP writer: local headers, central directory and end record; `stored` names skip compression.
function makeZip(files, stored = []) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, "utf8");
    const method = stored.includes(name) ? 0 : 8;
    const data = method ? deflateRawSync(raw) : raw;
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(method, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(method, 10); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const xlsx = makeZip({
  "xl/workbook.xml": '<workbook><sheets><sheet name="Resumo" sheetId="1" r:id="rId1"/><sheet name="Vazia" sheetId="2" r:id="rId2"/></sheets></workbook>',
  "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
  "xl/sharedStrings.xml": "<sst><si><t>Produto</t></si><si><r><t>Pix </t></r><r><t>&amp; Cartão</t></r></si></sst>",
  "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Total</t></is></c></row><row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3"><v>120</v></c><c r="C3"><f>SUM(B3:B3)</f></c><c r="D3" t="b"><v>1</v></c></row></sheetData></worksheet>',
  "xl/worksheets/sheet2.xml": "<worksheet><sheetData/></worksheet>",
}, ["xl/workbook.xml"]);

describe("office previews", () => {
  test("readZip reads stored and deflated parts", () => {
    const parts = readZip(xlsx);
    assert.match(parts.get("xl/workbook.xml")().toString(), /Resumo/);
    assert.match(parts.get("xl/sharedStrings.xml")().toString(), /Cartão/);
    assert.throws(() => readZip(Buffer.from("not a zip at all, just text")), /ZIP/);
  });

  test("xlsxPreview: sheets in order, shared/inline strings, real row numbers, formulas and booleans", () => {
    const preview = xlsxPreview(xlsx);
    assert.deepEqual(preview.sheets.map((sheet) => sheet.name), ["Resumo", "Vazia"]);
    assert.deepEqual(preview.sheets[0].rows, [["Produto", "", "Total", ""], ["", "", "", ""], ["Pix & Cartão", "120", "=SUM(B3:B3)", "VERDADEIRO"]]);
    assert.deepEqual(preview.sheets[1].rows, []);
    assert.equal(xlsxPreview(xlsx, { maxRows: 1 }).sheets[0].truncatedRows, true);
    assert.equal(columnIndex("A1"), 0);
    assert.equal(columnIndex("AB7"), 27);
  });

  test("docxPreview: headings, paragraphs and tables; pptxPreview: slides in numeric order", () => {
    const docx = makeZip({ "word/document.xml": '<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Relatório</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Texto com </w:t></w:r><w:r><w:t>&lt;símbolos&gt;</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p/></w:body></w:document>' });
    assert.deepEqual(docxPreview(docx).blocks, [{ type: "heading", level: 1, text: "Relatório" }, { type: "paragraph", level: 0, text: "Texto com <símbolos>" }, { type: "table", rows: [["A", "B"]] }]);
    const pptx = makeZip({ "ppt/slides/slide10.xml": "<p:sld><a:p><a:r><a:t>Dez</a:t></a:r></a:p></p:sld>", "ppt/slides/slide2.xml": "<p:sld><a:p><a:r><a:t>Dois</a:t></a:r></a:p><a:p><a:r><a:t>Tópico</a:t></a:r></a:p></p:sld>" });
    assert.deepEqual(pptxPreview(pptx).slides, [{ title: "Dois", lines: ["Tópico"] }, { title: "Dez", lines: [] }]);
    assert.throws(() => officePreview("velho.xls", Buffer.alloc(0)), /Abrir no app/);
    assert.equal(xmlText("&#233;&#x41;&amp;"), "éA&");
  });
});

describe("file viewer helpers", () => {
  test("CSV parsing: quotes, doubled quotes, line breaks inside quotes, BOM; the delimiter Excel pt-BR uses", () => {
    assert.deepEqual(parseDelimited('\uFEFFnome;valor\n"Silva; Ana";"10,5"\n"linha\ncom quebra";"diz ""oi"""\n', ";").rows, [["nome", "valor"], ["Silva; Ana", "10,5"], ["linha\ncom quebra", 'diz "oi"']]);
    assert.equal(parseDelimited("a\nb\nc\n", ",", 2).truncated, true);
    assert.equal(guessDelimiter("nome;valor;data"), ";");
    assert.equal(guessDelimiter("a,b,c"), ",");
    assert.equal(guessDelimiter("a\tb"), "\t");
    assert.equal(guessDelimiter("sozinho"), ",");
  });

  test("file kinds: CSV and TSV are tables, Office files have a preview, old binary Office has none", () => {
    assert.equal(fileInfo("vendas.csv").kind, "table");
    assert.equal(fileInfo("dados.tsv").kind, "table");
    for (const name of ["a.xlsx", "a.xlsm", "a.docx", "a.pptx"]) assert.equal(fileInfo(name).kind, "office", name);
    assert.equal(fileInfo("antigo.xls").kind, "other");
  });

  test("open in the app or the folder: explorer on Windows (path in quotes, verbatim), open and xdg-open elsewhere", () => {
    assert.deepEqual(systemOpenCommand("C:\\proj\\saidas\\a b.xlsx", "open", "win32"), { bin: "explorer.exe", args: ['"C:\\proj\\saidas\\a b.xlsx"'], verbatim: true });
    assert.deepEqual(systemOpenCommand("C:\\proj\\a.pdf", "folder", "win32").args, ['/select,"C:\\proj\\a.pdf"']);
    assert.deepEqual(systemOpenCommand("/p/a.pdf", "folder", "darwin"), { bin: "open", args: ["-R", "/p/a.pdf"], verbatim: false });
    assert.deepEqual(systemOpenCommand("/p/x/a.pdf", "folder", "linux").args, ["/p/x"]);
  });
});

describe("file paths in messages", async () => {
  const { renderInline } = await import("../public/lib.js");
  const link = (html) => /class="path-link" data-open="([^"]+)"/.exec(html)?.[1] ?? null;

  test("a plain Windows or relative path to a file the Studio opens becomes a link; the trailing period stays out", () => {
    const windowsPath = String.raw`D:\natia\Desktop\evolvera\saidas\teste-studio.xlsx`;
    assert.equal(link(renderInline(`Pronto: ${windowsPath}`)), windowsPath);
    assert.equal(link(renderInline("Veja saidas/relatorio.pdf.")), "saidas/relatorio.pdf");
    assert.equal(link(renderInline("Arquivo C:/proj/a.csv, e mais")), "C:/proj/a.csv");
  });

  test("versions, e-mails, folders, URLs and unknown file types are left alone", () => {
    for (const text of ["versão 1.2.3", "e-mail a@b.com", "pasta src/app", "texto.md sozinho", "binário saidas/app.exe"]) assert.equal(link(renderInline(text)), null, text);
    assert.match(renderInline("https://x.com/a.pdf"), /href="https:\/\/x\.com\/a\.pdf"/);
  });
});
