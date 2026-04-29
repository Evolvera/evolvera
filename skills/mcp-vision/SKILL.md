---
name: mcp-vision
description: Processa imagens coladas pelo usuário quando o modelo não suporta vision. Use SEMPRE que o usuário colar uma imagem, anexar uma imagem, ou quando aparecer "image omitted" ou "model does not support images" no contexto. Analisa imagens via MCP minimax_web_search_understand_image.
---

# MCP Vision Skill

## Quando usar

ATIVAR automaticamente quando:
- Usuário cola uma imagem (Ctrl+V, drag & drop)
- Aparece `(image omitted: model does not support images)` no contexto
- Usuário diz "o que você vê?" ou pede para analisar algo visual
- Qualquer referência a imagem, screenshot, foto, print

## Como funciona

O modelo atual **não suporta imagens nativamente**. Mas o usuário pode colar imagens que ficam salvas em arquivos temporários. Esta skill instrui como processá-las via MCP.

## Passo a passo

### 1. Procurar imagens do clipboard

Quando o usuário cola uma imagem, o Pi salva em arquivos temporários. Procure o(s) arquivo(s) mais recente(s):

```bash
ls -lt /var/folders/*/T/pi-clipboard-*.png 2>/dev/null | head -5
```

Ou:
```bash
find /var/folders -name "pi-clipboard-*.png" -mmin -5 2>/dev/null | head -5
```

### 2. Analisar via MCP

Para CADA imagem encontrada, chamar o MCP:

```javascript
mcp({
  server: "minimax-web-search",
  tool: "minimax_web_search_understand_image",
  args: JSON.stringify({
    prompt: "Descreva esta imagem em detalhes. Inclua texto visível, objetos, cores, layout, expressões, e qualquer contexto relevante.",
    image_source: "<caminho_da_imagem>"
  })
})
```

**IMPORTANTE:** O `image_source` aceita caminho local (sem `@`). Se o caminho começar com `@`, remova o `@`.

### 3. Responder ao usuário

Use a descrição retornada pelo MCP para responder o que o usuário perguntou sobre a imagem.

## Exemplo completo

Usuário cola imagem e pergunta "o que vc ve?"

1. Procuro imagens recentes:
```bash
find /var/folders -name "pi-clipboard-*.png" -mmin -2 2>/dev/null | head -1
```
→ `/var/folders/.../T/pi-clipboard-abc123.png`

2. Analiso via MCP:
```javascript
mcp({
  server: "minimax-web-search",
  tool: "minimax_web_search_understand_image",
  args: JSON.stringify({
    prompt: "Descreva esta imagem em detalhes",
    image_source: "/var/folders/.../T/pi-clipboard-abc123.png"
  })
})
```

3. Respondo com a descrição obtida.

## Notas

- Formatos suportados: PNG, JPG, JPEG, WEBP, GIF
- Imagens do clipboard geralmente ficam em `/var/folders/*/T/pi-clipboard-*.png`
- Sempre procure o arquivo MAIS RECENTE (use `-mmin -5` ou `-mmin -2`)
- Se encontrar múltiplas imagens, analise TODAS
