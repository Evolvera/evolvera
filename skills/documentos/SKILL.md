---
name: documentos
description: Gera arquivos para a pessoa abrir e entregar: PDF, planilha Excel (.xlsx), documento Word (.docx), apresentação PowerPoint (.pptx), página HTML e CSV. Use quando o pedido for "gera um PDF", "monta uma planilha", "exporta para Excel", "faz um relatório", "cria uma apresentação", "salva em HTML", ou quando a entrega natural for um arquivo e não texto no chat. Grava em saidas/ do projeto e termina dizendo o caminho, que o PI Studio abre na aba Navegador.
---

# Documentos

A entrega é um arquivo que abre e está certo, não um script que "deveria" gerar o arquivo. Gere, abra de volta e confira antes de dizer que terminou.

## Onde gravar

- Pasta `saidas/` na raiz do projeto (crie se não existir). Nome curto, em português, sem espaços: `saidas/relatorio-vendas-outubro.pdf`.
- Os scripts que geram ficam em `saidas/fontes/` quando a pessoa puder querer gerar de novo; senão, apague o script temporário.
- No fim, escreva o caminho completo do arquivo numa linha só. O PI Studio transforma o caminho em link e abre o arquivo dentro dele (PDF, HTML, imagem, Markdown, CSV e, como prévia, Excel, Word e PowerPoint). Para abrir no app do Windows, a pessoa usa "Abrir no app" na barra do Navegador.

## Ferramentas deste PC (Python já tem tudo)

| Formato | Como | Biblioteca |
|---|---|---|
| PDF com layout | Montar HTML + CSS e imprimir com o Chrome sem janela | Chrome (`--headless=new --print-to-pdf`) |
| PDF simples ou tabular | Gerar direto | `reportlab` |
| Excel | Planilha com abas, formatos e fórmulas | `openpyxl` (ler e escrever) ou `xlsxwriter` (só escrever, gráficos) |
| Word | Títulos, parágrafos, tabelas, imagens | `python-docx` |
| PowerPoint | Slides com título, tópicos, imagens | `python-pptx` |
| Gráficos para os arquivos acima | PNG | `matplotlib` |
| Dados | Ler CSV e Excel, agrupar | `pandas` |

Rode com `python` (Windows) ou `python3`. Se faltar uma biblioteca, diga qual e o comando para instalar; não troque de formato por conta própria.

## Receitas curtas

PDF a partir de HTML (o melhor para relatório bonito):

```bash
"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="saidas/relatorio.pdf" "file:///CAMINHO/ABSOLUTO/saidas/fontes/relatorio.html"
```

No HTML: `@page { size: A4; margin: 16mm }`, fonte do sistema, quebras com `break-after: page`, imagens com caminho absoluto `file:///`.

Excel com cabeçalho, largura e formato de número:

```python
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
wb = Workbook(); ws = wb.active; ws.title = "Resumo"
ws.append(["Produto", "Quantidade", "Valor"])
for cell in ws[1]: cell.font = Font(bold=True); cell.fill = PatternFill("solid", fgColor="E8F2EC")
ws.append(["Pix", 120, 5400.5]); ws["C2"].number_format = 'R$ #,##0.00'
ws["C3"] = "=SUM(C2:C2)"; ws.column_dimensions["A"].width = 28; ws.freeze_panes = "A2"
wb.save("saidas/resumo.xlsx")
```

Word: `Document()`, `add_heading`, `add_paragraph`, `add_table(rows, cols, style="Light Grid Accent 1")`, `add_picture(path, width=Inches(6))`, `save`.
PowerPoint: `Presentation()`, `slide_layouts[1]` para título e tópicos, `slides.add_slide`, `shapes.add_picture`, `save`.

## Conferir antes de entregar (obrigatório)

- PDF: abrir com `pypdf` e contar páginas; renderizar a primeira página para PNG (`pypdfium2` se houver) e olhar se não tem página em branco ou texto cortado.
- Excel: abrir de volta com `openpyxl.load_workbook` e ler as primeiras linhas de cada aba; conferir que fórmulas e números estão no lugar.
- Word e PowerPoint: abrir de volta e contar parágrafos ou slides.
- HTML: um arquivo só, abre sem servidor (CSS e imagens embutidos ou com caminho relativo que existe).
- Texto que alguém vai ler segue a VeroNati: sem travessão, frases curtas, números com o formato brasileiro (R$ 1.234,56; 29/10/2026).

## Não fazer

- Não diga "gerei" sem ter aberto o arquivo de volta.
- Não grave fora da pasta do projeto, nem por cima de um arquivo da pessoa sem ela pedir.
- Não coloque dado de exemplo como se fosse real: quando faltar dado, avise no próprio arquivo ("dados demonstrativos").
