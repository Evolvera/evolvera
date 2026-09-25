/**
 * Copy Thief — Documentador Playwright (padrão POP Enpro)
 *
 * A MESMA spec é teste de regressão, POP (manual do usuário) e relatório de execução.
 * Com CT_DOCS=1 cada passo fotografa a tela com os elementos marcados (caixa vermelha,
 * seta curta e bolinha numerada) e, ao final, gera:
 *   docs/pop/<fluxo>.html + .pdf                        (só se o teste passou)
 *   docs/execucoes/<data>-<issue>-<fluxo>.html + .pdf    (sempre)
 * Sem CT_DOCS=1 nada é capturado: a spec roda rápida como teste comum.
 *
 * Conteúdo textual do POP (Nº, versão, equipe, objetivos, público-alvo, ações corretivas,
 * histórico…) vive em docs/pop/<fluxo>.pop.json — criado com campos ⟨preencher⟩ na 1ª geração.
 * Identidade visual (logos, cores, frase de fonte) em docs/pop/_marca.json (opcional).
 *
 * Uso:
 *   import { test, expect } from './support/documentador';
 *   test('cadastro', async ({ page, doc }) => {
 *     doc.iniciar({ fluxo: 'cadastro-cliente', titulo: 'Cadastro de clientes' });
 *     await page.goto('/clientes');
 *     doc.atividade('Cadastrar um cliente, tela /clientes (uso do atendente)', 'Texto de abertura.');
 *     await doc.tela('Conhecer a tela', 'A tela mostra…', [
 *       { alvo: page.getByRole('button', { name: 'Novo cliente' }), rotulo: 'Botão "Novo cliente"' },
 *       { alvo: page.getByRole('list'), rotulo: 'Lista de clientes cadastrados' },
 *     ]);
 *     await doc.passo('Abrir o formulário', 'Clique em "Novo cliente".',
 *       page.getByRole('button', { name: 'Novo cliente' }), a => a.click());
 *   });
 *
 * Variáveis: CT_DOCS=1 · CT_ISSUE=<n> · CT_SHA=<commit> · CT_DOCS_DIR=<raiz> (padrão docs)
 */
import { test as base, expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export { expect };

const ATIVO = process.env.CT_DOCS === '1';
const RAIZ = process.env.CT_DOCS_DIR ?? 'docs';
const DIR_POP = path.join(RAIZ, 'pop');
const PREENCHER = '⟨preencher⟩';

export type ConteudoPop = {
  numero: string; titulo: string; versao: string; equipe: string;
  dataRevisao?: string; dataPublicacao?: string;
  descricao: string; objetivos: string[]; publicoAlvo: string[]; preRequisitos: string[];
  materialNecessario: string[]; resultadosEsperados: string[];
  acoesCorretivas: { situacao: string; oQueFazer: string }[];
  materialSuporte: string[];
  participantes: { nome: string; setor: string; funcao: string }[];
  historico: { versao: string; data: string; descricao: string; requisitadoPor?: string }[];
  observacoes: string[];
};
type Marca = {
  logoEsquerda?: string; logoDireita?: string; fonteFigura?: string; corLinha?: string; corAnotacao?: string;
  /** 'seta' (padrão, estilo Controle de Evidências) | 'bolinha' (estilo Cariacica: bolinha à esquerda, sem seta) */
  estiloAnotacao?: 'seta' | 'bolinha';
};
type MarcaAlvo = { alvo: Locator; rotulo: string };
type Figura = { n: number; legenda: string; img: string; itens: string[] };
type Passo = { id: string; titulo: string; texto: string; atencao?: string; figura?: Figura; ok: boolean; ms: number; erro?: string };
type Atividade = { n: number; titulo: string; introducao: string; passos: Passo[] };
/** telaInteira: fotografa a janela toda em vez de recortar em volta das marcas. */
type Opcoes = { atencao?: string; legenda?: string; rotulo?: string; telaInteira?: boolean };

const hoje = () => new Date().toLocaleDateString('pt-BR');

function esqueleto(titulo: string): ConteudoPop {
  return {
    numero: PREENCHER, titulo, versao: '1.0', equipe: PREENCHER,
    dataRevisao: hoje(), dataPublicacao: hoje(),
    descricao: PREENCHER, objetivos: [PREENCHER], publicoAlvo: [PREENCHER],
    preRequisitos: [PREENCHER], materialNecessario: [PREENCHER], resultadosEsperados: [PREENCHER],
    acoesCorretivas: [{ situacao: PREENCHER, oQueFazer: PREENCHER }],
    materialSuporte: [PREENCHER],
    participantes: [{ nome: PREENCHER, setor: PREENCHER, funcao: PREENCHER }],
    historico: [{ versao: '1.0', data: hoje(), descricao: 'Criação do documento', requisitadoPor: PREENCHER }],
    observacoes: [
      'As telas deste POP foram capturadas automaticamente em ambiente de teste, com dados fictícios.',
      'Sempre que o sistema mudar, o POP deve ser regerado a partir do teste e o Histórico de Revisões atualizado.',
    ],
  };
}

function dataUri(arquivo?: string): string | undefined {
  if (!arquivo || !fs.existsSync(arquivo)) return undefined;
  const ext = path.extname(arquivo).slice(1).toLowerCase();
  const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  return `data:${mime};base64,${fs.readFileSync(arquivo).toString('base64')}`;
}

export class Documentador {
  private fluxo = '';
  private conteudo?: ConteudoPop;
  private marca: Marca = {};
  private atividades: Atividade[] = [];
  private nFig = 0;
  private consoleErros: string[] = [];
  private redeFalhas: string[] = [];
  private inicio = Date.now();

  constructor(private page: Page, private info: TestInfo) {
    page.on('console', m => { if (m.type() === 'error') this.consoleErros.push(m.text()); });
    page.on('pageerror', e => this.consoleErros.push(String(e)));
    page.on('requestfailed', r => this.redeFalhas.push(`${r.method()} ${r.url()} — ${r.failure()?.errorText ?? 'falhou'}`));
    page.on('response', r => { if (r.status() >= 400) this.redeFalhas.push(`${r.status()} ${r.request().method()} ${r.url()}`); });
  }

  iniciar({ fluxo, titulo }: { fluxo: string; titulo: string }) {
    this.fluxo = fluxo;
    if (!ATIVO) return;
    const arqMarca = path.join(DIR_POP, '_marca.json');
    if (fs.existsSync(arqMarca)) this.marca = JSON.parse(fs.readFileSync(arqMarca, 'utf8'));
    const arq = path.join(DIR_POP, `${fluxo}.pop.json`);
    if (fs.existsSync(arq)) this.conteudo = { ...esqueleto(titulo), ...JSON.parse(fs.readFileSync(arq, 'utf8')) };
    else {
      this.conteudo = esqueleto(titulo);
      fs.mkdirSync(DIR_POP, { recursive: true });
      fs.writeFileSync(arq, JSON.stringify(this.conteudo, null, 2), 'utf8');
    }
  }

  /** Abre uma atividade numerada ("1. …"). Os passos seguintes viram 1.1, 1.2… */
  atividade(titulo: string, introducao = '') {
    this.atividades.push({ n: this.atividades.length + 1, titulo, introducao, passos: [] });
  }

  /** Passo com ação: marca o alvo, fotografa e executa a ação. */
  async passo(titulo: string, texto: string, alvo?: Locator, acao?: (alvo: Locator) => Promise<unknown>, opcoes: Opcoes = {}) {
    const marcas = alvo ? [{ alvo, rotulo: opcoes.rotulo ?? titulo }] : [];
    await this.registrar(titulo, texto, marcas, opcoes, acao && alvo ? () => acao(alvo) : undefined);
  }

  /** Passo explicativo: vários elementos numerados no mesmo print, sem ação. */
  async tela(titulo: string, texto: string, marcas: MarcaAlvo[], opcoes: Opcoes = {}) {
    await this.registrar(titulo, texto, marcas, opcoes);
  }

  private atual(): Atividade {
    if (!this.atividades.length) this.atividade(this.conteudo?.titulo ?? this.fluxo);
    return this.atividades[this.atividades.length - 1];
  }

  private async registrar(titulo: string, texto: string, marcas: MarcaAlvo[], opcoes: Opcoes, acao?: () => Promise<unknown>) {
    const at = this.atual();
    const id = `${at.n}.${at.passos.length + 1}`;
    const t0 = Date.now();
    const p: Passo = { id, titulo, texto, atencao: opcoes.atencao, ok: true, ms: 0 };
    at.passos.push(p);
    await base.step(`${id} ${titulo}`, async () => {
      try {
        if (ATIVO) p.figura = await this.figura(opcoes.legenda ?? titulo, marcas, opcoes.telaInteira);
        if (acao) await acao();
      } catch (e) {
        p.ok = false;
        p.erro = String(e).replace(/\u001b\[[0-9;]*m/g, '').slice(0, 500);
        if (ATIVO) p.figura = await this.figura(`Falha no passo ${id}`, []).catch(() => p.figura);
        throw e;
      } finally {
        p.ms = Date.now() - t0;
      }
    });
  }

  private async figura(legenda: string, marcas: MarcaAlvo[], telaInteira = false): Promise<Figura> {
    const n = ++this.nFig;
    const caixas: Array<{ x: number; y: number; width: number; height: number; n: number }> = [];
    for (const [i, m] of marcas.entries()) {
      if (i === 0) await m.alvo.scrollIntoViewIfNeeded();
      const b = await m.alvo.boundingBox();
      if (b) caixas.push({ ...b, n: i + 1 });
    }
    if (caixas.length) await this.page.evaluate(desenharMarcas, {
      caixas, cor: this.marca.corAnotacao ?? '#ED3237', seta: (this.marca.estiloAnotacao ?? 'seta') === 'seta',
    });
    const clip = telaInteira ? undefined : this.recorte(caixas);
    const buf = await this.page.screenshot({ type: 'jpeg', quality: 85, clip });
    await this.page.evaluate(() => document.getElementById('__ct_anotacao')?.remove());
    await this.info.attach(`figura-${String(n).padStart(2, '0')}`, { body: buf, contentType: 'image/jpeg' });
    return { n, legenda, img: `data:image/jpeg;base64,${buf.toString('base64')}`, itens: marcas.map(m => m.rotulo) };
  }

  /** Recorta em volta dos elementos marcados (com folga p/ bolinhas e setas), mínimo 640×360. */
  private recorte(caixas: Array<{ x: number; y: number; width: number; height: number }>) {
    const vp = this.page.viewportSize();
    if (!caixas.length || !vp) return undefined;
    const MIN_W = Math.min(900, vp.width), MIN_H = Math.min(420, vp.height);
    let x0 = Math.min(...caixas.map(c => c.x)) - 110, y0 = Math.min(...caixas.map(c => c.y)) - 70;
    let x1 = Math.max(...caixas.map(c => c.x + c.width)) + 110, y1 = Math.max(...caixas.map(c => c.y + c.height)) + 70;
    if (x1 - x0 < MIN_W) { const m = (x0 + x1) / 2; x0 = m - MIN_W / 2; x1 = m + MIN_W / 2; }
    if (y1 - y0 < MIN_H) { const m = (y0 + y1) / 2; y0 = m - MIN_H / 2; y1 = m + MIN_H / 2; }
    // desloca para dentro da janela (não encolhe) e encosta nas bordas próximas p/ manter contexto
    if (x1 > vp.width) { x0 -= x1 - vp.width; x1 = vp.width; } if (y1 > vp.height) { y0 -= y1 - vp.height; y1 = vp.height; }
    if (x0 < 160) x0 = 0; if (y0 < 120) y0 = 0;
    if (vp.width - x1 < 160) x1 = vp.width; if (vp.height - y1 < 120) y1 = vp.height;
    return { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) };
  }

  /** Chamado automaticamente pelo fixture no fim do teste. */
  async finalizar() {
    if (!ATIVO || !this.conteudo) return;
    const passou = this.info.status === 'passed' && this.info.expectedStatus === 'passed';
    const data = new Date().toISOString().slice(0, 10);
    const issue = process.env.CT_ISSUE ? `issue-${process.env.CT_ISSUE}` : 'local';
    const ctx: Ctx = { c: this.conteudo, marca: this.marca, atividades: this.atividades };
    const saidas: Array<[string, string]> = [];
    if (passou) saidas.push([path.join(DIR_POP, `${this.fluxo}.html`), htmlPop(ctx)]);
    saidas.push([path.join(RAIZ, 'execucoes', `${data}-${issue}-${this.fluxo}.html`), htmlExecucao(ctx, {
      passou, status: this.info.status ?? '?', teste: this.info.titlePath.join(' › '),
      duracaoMs: Date.now() - this.inicio, navegador: this.info.project.name || 'padrão',
      sha: process.env.CT_SHA ?? '', issue: process.env.CT_ISSUE ?? '',
      consoleErros: this.consoleErros, redeFalhas: this.redeFalhas,
      erro: this.info.errors.map(e => (e.message ?? '').replace(/\u001b\[[0-9;]*m/g, '')).join('\n').slice(0, 2000),
    })]);
    for (const [arquivo, html] of saidas) {
      fs.mkdirSync(path.dirname(arquivo), { recursive: true });
      fs.writeFileSync(arquivo, html, 'utf8');
      await this.pdf(html, arquivo.replace(/\.html$/, '.pdf'));
    }
  }

  private async pdf(html: string, destino: string) {
    const nav = this.info.project.use.browserName;
    if (nav && nav !== 'chromium') return;
    const esq = dataUri(this.marca.logoEsquerda), dir = dataUri(this.marca.logoDireita);
    const logo = (src?: string) => (src ? `<img src="${src}" style="height:13mm;max-width:60mm;object-fit:contain">` : '<span></span>');
    const p = await this.page.context().newPage();
    try {
      await p.setContent(html, { waitUntil: 'load' });
      await p.pdf({
        path: destino, format: 'A4', printBackground: true, displayHeaderFooter: true,
        headerTemplate: `<div style="width:100%;padding:0 18mm;display:flex;justify-content:space-between;align-items:center">${logo(esq)}${logo(dir)}</div>`,
        footerTemplate: `<div style="width:100%;padding:0 18mm;text-align:right;font:9pt Arial"><span class="pageNumber"></span></div>`,
        margin: { top: '30mm', bottom: '18mm', left: '18mm', right: '18mm' },
      });
    } catch { /* PDF só existe no Chromium headless; o HTML continua valendo */ }
    finally { await p.close(); }
  }
}

/** Roda NO NAVEGADOR: caixa vermelha + (seta curta) + bolinha numerada em cada elemento. */
function desenharMarcas({ caixas, cor, seta }: { caixas: Array<{ x: number; y: number; width: number; height: number; n: number }>; cor: string; seta: boolean }) {
  document.getElementById('__ct_anotacao')?.remove();
  const W = window.innerWidth, H = window.innerHeight;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="position:fixed;inset:0">` +
    `<defs><marker id="ctp" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto">` +
    `<path d="M0,0 L12,6 L0,12 z" fill="${cor}"/></marker></defs>`;
  for (const c of caixas) {
    const x = c.x - 4, y = c.y - 4, w = c.width + 8, h = c.height + 8;
    const daEsquerda = x > (seta ? 64 : 30) || x + w + 64 > W; // entra pela esquerda sempre que houver espaço
    let bx: number, by: number;
    if (seta) {
      const cy = y + h / 2;
      const x1 = daEsquerda ? Math.max(x - 40, 26) : x + w + 40;
      const x2 = daEsquerda ? x - 3 : x + w + 3;
      bx = daEsquerda ? Math.max(x1 - 13, 13) : Math.min(x1 + 13, W - 13);
      by = cy;
      if (Math.abs(x2 - x1) > 8) s += `<line x1="${x1}" y1="${cy}" x2="${x2}" y2="${cy}" stroke="${cor}" stroke-width="2.5" marker-end="url(#ctp)"/>`;
    } else {                                                  // Cariacica: bolinha à esquerda, alinhada ao topo
      bx = daEsquerda ? Math.max(x - 16, 13) : Math.min(x + w + 16, W - 13);
      by = Math.max(y + 10, 13);
    }
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="none" stroke="${cor}" stroke-width="2.5"/>`;
    s += `<circle cx="${bx}" cy="${by}" r="12" fill="${cor}" stroke="#fff" stroke-width="1.5"/>` +
      `<text x="${bx}" y="${by + 4.5}" text-anchor="middle" font-family="Arial" font-weight="700" font-size="13" fill="#fff">${c.n}</text>`;
  }
  const raiz = document.createElement('div');
  raiz.id = '__ct_anotacao';
  raiz.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
  raiz.innerHTML = s + '</svg>';
  document.body.appendChild(raiz);
}

// ───────────────────────────── geração do HTML (padrão Enpro) ─────────────────────────────
type Ctx = { c: ConteudoPop; marca: Marca; atividades: Atividade[] };

const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
/** Legenda aceita **negrito** nos termos-chave, como nos POPs de referência. */
const negrito = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const v = (s?: string) => (!s || s === PREENCHER ? `<span class="preencher">${PREENCHER}</span>` : esc(s));
const lista = (itens: string[]) => `<ul>${(itens.length ? itens : [PREENCHER]).map(i => `<li>${v(i)}</li>`).join('')}</ul>`;
const secao = (n: number, titulo: string, corpo: string) =>
  `<h2 class="secao"><span>${n}.</span>${titulo}</h2><div class="conteudo">${corpo}</div>`;

function css(m: Marca) {
  const linha = m.corLinha ?? '#2B2B8C', anot = m.corAnotacao ?? '#ED3237';
  return `@page{size:A4}
body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;color:#000;max-width:780px;margin:24px auto;padding:0 16px;line-height:1.55}
.topo{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}.topo img{height:56px;max-width:220px;object-fit:contain}
@media print{.topo{display:none}body{margin:0;max-width:none;padding:0}}
table{border-collapse:collapse;width:100%;margin:10px 0}td,th{border:1px solid #000;padding:7px 9px;font-size:10.5pt;vertical-align:middle}
table.cab td{text-align:center}table.cab .rot{font-weight:700}th{background:#f2f2f2;text-align:left}
h2.secao{display:flex;font-size:11pt;font-weight:700;margin:26px 0 12px;padding-bottom:7px;border-bottom:1.6px solid ${linha};page-break-after:avoid}
h2.secao span{width:40px;flex:none}.conteudo{margin-left:40px;text-align:justify}
h3.atividade{font-size:11pt;margin:18px 0 6px}h4.passo{font-size:11pt;margin:14px 0 4px}h4.passo span{margin-right:10px}
figure{margin:14px 0;text-align:center;page-break-inside:avoid}.fig-titulo{font-size:10.5pt;margin-bottom:6px}
figure img{max-width:100%;box-sizing:border-box;border:1px solid #9a9a9a}.fonte{font-size:10pt;margin-top:6px}
ol.legenda{list-style:none;padding:0;margin:8px 0 0;text-align:left}ol.legenda li{margin:5px 0;display:flex;gap:8px;align-items:flex-start}
ol.legenda .bola{flex:none;width:17px;height:17px;border-radius:50%;background:${anot};color:#fff;font:700 10px/17px Arial;text-align:center;margin-top:2px}
.preencher{background:#fff3b0;padding:0 3px}.ok{color:#1a7f37;font-weight:700}.falha{color:#c62828;font-weight:700}
pre{background:#f6f6f6;padding:8px;white-space:pre-wrap;font-size:9.5pt;text-align:left}`;
}

function topo(m: Marca) {
  const e = dataUri(m.logoEsquerda), d = dataUri(m.logoDireita);
  return e || d ? `<div class="topo">${e ? `<img src="${e}">` : '<span></span>'}${d ? `<img src="${d}">` : '<span></span>'}</div>` : '';
}

function cabecalho(c: ConteudoPop) {
  return `<table class="cab">
<tr><td colspan="2" class="rot">PROCEDIMENTO OPERACIONAL PADRÃO - POP</td><td colspan="2" class="rot">Nº ${v(c.numero)}</td></tr>
<tr><td class="rot">Título</td><td>${v(c.titulo)}</td><td class="rot">Versão Nº ${v(c.versao)}</td><td></td></tr>
<tr><td class="rot" rowspan="2">Equipe</td><td rowspan="2">${v(c.equipe)}</td><td>Data da Revisão</td><td>${v(c.dataRevisao)}</td></tr>
<tr><td>Data de Publicação</td><td>${v(c.dataPublicacao)}</td></tr></table>`;
}

function figuraHtml(f: Figura, m: Marca) {
  const fonte = (m.fonteFigura ?? 'Fonte: Elaborado pelo autor ({ano}).').replace('{ano}', String(new Date().getFullYear()));
  const leg = f.itens.length
    ? `<ol class="legenda">${f.itens.map((t, i) => `<li><span class="bola">${i + 1}</span><span>${negrito(t)}</span></li>`).join('')}</ol>` : '';
  return `<figure><div class="fig-titulo">Figura ${f.n} – ${esc(f.legenda)}</div><img src="${f.img}" alt="Figura ${f.n}"><div class="fonte">${esc(fonte)}</div>${leg}</figure>`;
}

function atividadesHtml(ctx: Ctx, comStatus = false) {
  return ctx.atividades.map(a => `<h3 class="atividade">${a.n}. ${esc(a.titulo)}</h3>${a.introducao ? `<p>${esc(a.introducao)}</p>` : ''}` +
    a.passos.map(p => `<h4 class="passo"><span>${p.id}</span>${esc(p.titulo)}${comStatus ? ` <span class="${p.ok ? 'ok' : 'falha'}">${p.ok ? '✅' : '❌'}</span>` : ''}</h4>` +
      `<p>${esc(p.texto)}</p>${p.atencao ? `<p><b>Atenção:</b> ${esc(p.atencao)}</p>` : ''}${p.figura ? figuraHtml(p.figura, ctx.marca) : ''}` +
      (comStatus && p.erro ? `<pre class="falha">${esc(p.erro)}</pre>` : '')).join('')).join('');
}

function htmlPop(ctx: Ctx) {
  const c = ctx.c;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>POP ${esc(c.numero)} — ${esc(c.titulo)}</title><style>${css(ctx.marca)}</style></head><body>
${topo(ctx.marca)}${cabecalho(c)}
${secao(1, 'Descrição', `<p>${v(c.descricao)}</p>`)}
${secao(2, 'Objetivos', lista(c.objetivos))}
${secao(3, 'Público-Alvo', lista(c.publicoAlvo))}
${secao(4, 'Pré-requisitos', lista(c.preRequisitos))}
${secao(5, 'Material necessário', lista(c.materialNecessario))}
${secao(6, 'Atividades', atividadesHtml(ctx))}
${secao(7, 'Resultados esperados', lista(c.resultadosEsperados))}
${secao(8, 'Possíveis ações corretivas', `<table><tr><th>Situação</th><th>O que fazer</th></tr>${c.acoesCorretivas.map(a => `<tr><td>${v(a.situacao)}</td><td>${v(a.oQueFazer)}</td></tr>`).join('')}</table>`)}
${secao(9, 'Material de Suporte', lista(c.materialSuporte))}
${secao(10, 'Participantes na elaboração do documento', `<table><tr><th>Nome</th><th>Setor</th><th>Função</th></tr>${c.participantes.map(p => `<tr><td>${v(p.nome)}</td><td>${v(p.setor)}</td><td>${v(p.funcao)}</td></tr>`).join('')}</table>`)}
${secao(11, 'Histórico de Revisões', `<table><tr><th>Versão</th><th>Data</th><th>Descrição das mudanças</th><th>Requisitado por</th></tr>${c.historico.map(h => `<tr><td>${v(h.versao)}</td><td>${v(h.data)}</td><td>${v(h.descricao)}</td><td>${v(h.requisitadoPor)}</td></tr>`).join('')}</table>`)}
${secao(12, 'Observações', c.observacoes.map(o => `<p>${v(o)}</p>`).join(''))}
</body></html>`;
}

function htmlExecucao(ctx: Ctx, x: {
  passou: boolean; status: string; teste: string; duracaoMs: number; navegador: string; sha: string; issue: string;
  consoleErros: string[]; redeFalhas: string[]; erro: string;
}) {
  const passos = ctx.atividades.flatMap(a => a.passos);
  const bloco = (itens: string[]) => (itens.length ? `<pre>${esc(itens.join('\n'))}</pre>` : '<p class="ok">Nenhum.</p>');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Execução — ${esc(ctx.c.titulo)}</title><style>${css(ctx.marca)}</style></head><body>
${topo(ctx.marca)}
<table class="cab"><tr><td colspan="2" class="rot">RELATÓRIO DE EXECUÇÃO DE TESTE</td><td colspan="2" class="rot ${x.passou ? 'ok' : 'falha'}">${x.passou ? '✅ PASSOU' : '❌ FALHOU'}</td></tr>
<tr><td class="rot">Fluxo</td><td>${esc(ctx.c.titulo)}</td><td class="rot">Issue</td><td>${x.issue ? `#${esc(x.issue)}` : '—'}</td></tr>
<tr><td class="rot">Teste</td><td>${esc(x.teste)}</td><td class="rot">Commit</td><td>${esc(x.sha.slice(0, 10)) || '—'}</td></tr>
<tr><td class="rot">Data</td><td>${new Date().toLocaleString('pt-BR')}</td><td class="rot">Duração</td><td>${(x.duracaoMs / 1000).toFixed(1)} s · ${esc(x.navegador)}</td></tr></table>
${secao(1, 'Resumo dos passos', `<table><tr><th>Passo</th><th>Descrição</th><th>Resultado</th><th>Tempo</th></tr>${passos.map(p => `<tr><td>${p.id}</td><td>${esc(p.titulo)}</td><td class="${p.ok ? 'ok' : 'falha'}">${p.ok ? '✅ ok' : '❌ falhou'}</td><td>${p.ms} ms</td></tr>`).join('')}</table>${x.erro ? `<p class="falha">Erro:</p><pre>${esc(x.erro)}</pre>` : ''}`)}
${secao(2, 'Erros de console', bloco(x.consoleErros))}
${secao(3, 'Falhas de rede / HTTP ≥ 400', bloco(x.redeFalhas))}
${secao(4, 'Evidências passo a passo', atividadesHtml(ctx, true))}
</body></html>`;
}

/** `test` com o fixture `doc` (finaliza e grava os documentos automaticamente). */
export const test = base.extend<{ doc: Documentador }>({
  doc: async ({ page }, use, testInfo) => {
    const doc = new Documentador(page, testInfo);
    await use(doc);
    await doc.finalizar();
  },
});
