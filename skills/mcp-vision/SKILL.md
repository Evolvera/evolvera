---
name: mcp-vision
description: Processa imagens coladas pelo usuário. Use SEMPRE que o usuário colar uma imagem, anexar uma imagem, ou quando aparecer "image omitted" ou "model does not support images" no contexto. Analisa imagens via tool understand_image.
---

# MCP Vision Skill

## Quando usar

ATIVAR automaticamente quando:
- Usuário cola uma imagem (Ctrl+V, drag & drop)
- Aparece `(image omitted: model does not support images)` no contexto
- Usuário diz "o que você vê?", "analisa essa imagem", ou pede para analisar algo visual
- Qualquer referência a imagem, screenshot, foto, print

## Como funciona

O modelo atual **não suporta imagens nativamente**. Mas o usuário pode colar imagens que ficam salvas em arquivos temporários. Esta skill usa a tool `understand_image` para processá-las.

## Passo a passo

### 1. Procurar imagens do clipboard

Quando o usuário cola uma imagem, o Pi salva em arquivos temporários. Procure o(s) arquivo(s) mais recente(s):

```bash
find /var/folders -name "pi-clipboard-*.png" -mmin -2 2>/dev/null | head -5
```

### 2. Analisar com understand_image

Para CADA imagem encontrada, chame a tool `understand_image`:

```
understand_image({
  prompt: "Descreva esta imagem em detalhes. Inclua texto visível, objetos, cores, layout, expressões, e qualquer contexto relevante.",
  image_url: "/caminho/da/imagem.png"
})
```

**image_url** aceita:
- Caminhos locais: `/var/folders/.../pi-clipboard-xxx.png`
- URLs HTTP/HTTPS: `https://exemplo.com/imagem.png`
- O prefixo `@` é removido automaticamente se presente

### 3. Responder ao usuário

Use a descrição retornada pela tool para responder o que o usuário perguntou sobre a imagem.

## Exemplos de uso

### Bug/Issue em screenshot
```
understand_image({
  prompt: "O que está errado nesta tela? Identifique todos os problemas visuais ou de UI.",
  image_url: "/var/folders/.../pi-clipboard-abc.png"
})
```

### Descrever o que vê
```
understand_image({
  prompt: "Descreva o que você vê nesta imagem em detalhes.",
  image_url: "/var/folders/.../pi-clipboard-abc.png"
})
```

### Extrair texto (OCR)
```
understand_image({
  prompt: "Extraia todo o texto visível nesta imagem.",
  image_url: "/var/folders/.../pi-clipboard-abc.png"
})
```

## Formatos suportados

- PNG, JPG, JPEG, WebP

## Dicas

- Sempre procure a imagem MAIS RECENTE (`-mmin -2`)
- Se encontrar múltiplas imagens, analise TODAS
- Seja específico no prompt sobre o que quer saber
- Para screenshots de erro, pergunte qual o erro e onde está
