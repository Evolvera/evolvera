#!/usr/bin/env python3
"""VeroNati · varredura de interface.

Aponta, em HTML/CSS/JS/TS/JSX/TSX/Vue/Svelte/MD, o que o padrão proíbe:
  TRAVESSAO   "—" ou "–" em texto, ou " - " / " | " usados como separador
  FONTE       font-size abaixo de 12px (px, ou rem/em < 0.75)
  OPCAO       <option> cujo texto começa com "·"
  SEPARADOR   "·" colado no que vem depois ("2026 ·R$")
  EXPLICACAO  subtítulo/ajuda/rodapé com texto longo à vista (candidato ao (i))

Uso: python varrer.py <pasta-ou-arquivo> [...] [--max 400]
Saída: arquivo:linha  TIPO  trecho. Código de saída 1 se achar algo.
Comentários de código são ignorados de forma aproximada; confira cada achado.
"""
import os
import re
import sys

EXT = {'.html', '.htm', '.css', '.scss', '.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx', '.vue', '.svelte', '.md'}
PULAR = {'node_modules', '.git', 'dist', 'build', 'vendor', '.next', 'coverage', 'test-results', '__pycache__'}

R_TRAV = re.compile(r'[—–]')
# " - " e " | " só contam entre LETRAS dentro de texto (fora de ${...}): "Dono - prazo".
# Conta de código ("L - 12", "a - b" fora de string) não entra.
R_HIFEN_SEP = re.compile(r'''["'`>][^"'`<\n]*[A-Za-zÀ-ÿ)] - [A-Za-zÀ-ÿ(][^"'`<\n]*["'`<]''')
R_BARRA_SEP = re.compile(r'''["'`>][^"'`<\n]*[A-Za-zÀ-ÿ)] \| [A-Za-zÀ-ÿ(][^"'`<\n]*["'`<]''')
R_INTERP = re.compile(r'\$\{[^{}]*\}')
R_FONTE = re.compile(r'font-size\s*:\s*(\d+(?:\.\d+)?)(px|rem|em)\b', re.I)
R_OPCAO = re.compile(r'<option[^>]*>\s*·')
R_ICONE_IA = re.compile(r'[✨✦✧]|\b(Sparkle|Sparkles|MagicWand|WandSparkles|Robot|Brain)\b')
R_VERBO_VAZIO = re.compile(r'\b(revolucion\w*|potencializ\w*|eleve sua|sem esfor[cç]o|m[aá]gic[oa]s?|next-gen|o futuro d[aeo]|powered by)\b', re.I)
R_SEP_COLADO = re.compile(r'\w ·[A-Za-zÀ-ÿ0-9R$]')
R_EXPLICA = re.compile(r'class="[^"]*\b(page-subtitle|card-subtitle|section-subtitle|form-help|explica|subtitle|help-text|hint)\b[^"]*"[^>]*>([^<]{120,})<', re.I)


def comentario(linha, ext):
    s = linha.strip()
    if ext in {'.css', '.scss'}:
        return s.startswith('/*') or s.startswith('*')
    if ext in {'.md'}:
        return False
    return s.startswith('//') or s.startswith('/*') or s.startswith('*') or s.startswith('<!--')


def _branco(m):
    # troca o comentário por espaços e mantém as quebras: o número da linha não muda
    return re.sub(r'[^\n]', ' ', m.group(0))


def sem_comentarios(txt, ext):
    if ext == '.md':
        return txt
    txt = re.sub(r'<!--[\s\S]*?-->', _branco, txt)
    txt = re.sub(r'/\*[\s\S]*?\*/', _branco, txt)
    if ext not in {'.css', '.scss', '.html', '.htm'}:
        # comentário de linha, mas não o "//" de "https://"
        txt = re.sub(r'(^|[\s;{}(),])//[^\n]*',
                     lambda m: m.group(1) + ' ' * (len(m.group(0)) - len(m.group(1))), txt, flags=re.M)
    return txt


def arquivos(alvos):
    for a in alvos:
        if os.path.isfile(a):
            yield a
            continue
        for raiz, dirs, nomes in os.walk(a):
            dirs[:] = [d for d in dirs if d not in PULAR]
            for n in nomes:
                if os.path.splitext(n)[1].lower() in EXT:
                    yield os.path.join(raiz, n)


def varrer(caminho):
    ext = os.path.splitext(caminho)[1].lower()
    try:
        bruto = open(caminho, encoding='utf-8', errors='ignore').read()
    except OSError:
        return []
    linhas = sem_comentarios(bruto, ext).split('\n')
    achados = []
    for i, l in enumerate(linhas, 1):
        if comentario(l, ext):
            continue
        trecho = l.strip()[:140]
        if ext not in {'.css', '.scss'}:
            texto = R_INTERP.sub('0', R_INTERP.sub('0', l))
            if R_TRAV.search(l):
                achados.append((i, 'TRAVESSAO', trecho))
            elif R_HIFEN_SEP.search(texto):
                achados.append((i, 'TRAVESSAO', trecho))
            if R_BARRA_SEP.search(texto) and '||' not in l:
                achados.append((i, 'TRAVESSAO', trecho + '  (barra "|" como separador)'))
            if R_OPCAO.search(l):
                achados.append((i, 'OPCAO', trecho))
            if R_ICONE_IA.search(l):
                achados.append((i, 'CARA_DE_IA', trecho + '  (ícone de brilho/estrelinha, robô ou cérebro)'))
            if R_VERBO_VAZIO.search(texto):
                achados.append((i, 'CARA_DE_IA', trecho + '  (verbo de propaganda vazio)'))
            if R_SEP_COLADO.search(l):
                achados.append((i, 'SEPARADOR', trecho))
            m = R_EXPLICA.search(l)
            if m:
                achados.append((i, 'EXPLICACAO', f'{m.group(1)}: {m.group(2)[:80]}…  (vai para o (i)?)'))
        for m in R_FONTE.finditer(l):
            v, u = float(m.group(1)), m.group(2).lower()
            px = v if u == 'px' else v * 16
            if px < 12:
                achados.append((i, 'FONTE', f'{m.group(0)}  (~{px:g}px, mínimo 12px)'))
    return achados


def main(argv):
    alvos = [a for a in argv if not a.startswith('--')] or ['.']
    total = 0
    for f in arquivos(alvos):
        for linha, tipo, trecho in varrer(f):
            print(f'{f}:{linha}  {tipo}  {trecho}')
            total += 1
    print(f'\n{total} achado(s).' if total else 'Nenhum achado. VeroNati ok.')
    return 1 if total else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
