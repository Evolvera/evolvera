---
name: mcp-vision
description: Processa imagens coladas pelo usuário. ATIVAR SEMPRE ao ver "image omitted" ou "model does not support images" no contexto. Usa understand_image para analisar.
---

# MCP Vision Skill

## REGRAS DE ATIVAÇÃO (OBRIGATÓRIO)

**ATIVAR IMEDIATAMENTE quando aparecer:**
- `(image omitted: model does not support images)` no contexto
- `(image omitted)` no contexto
- Usuário colou/anexou imagem
- Usuário diz "analisa essa imagem", "o que você vê", "olha isso"

**NUNCA ignore esses sinais.** Não peça permissão, não explique — apenas faça.

---

## Passo a passo

### 1. Buscar imagem do clipboard

Executar SEMPRE neste ordem:

```bash
# Primeiro: buscar imagens muito recentes (últimos 2 min)
find /var/folders -name "pi-clipboard-*.png" -mmin -2 2>/dev/null | head -5

# Se não encontrar: buscar imagens recentes (últimos 10 min)
find /var/folders -name "pi-clipboard-*.png" -mmin -10 2>/dev/null | head -5

# Se ainda não encontrar: buscar qualquer imagem clipboard
find /var/folders -name "pi-clipboard-*.png" 2>/dev/null | head -5
```

**Prioridade:** `.png` > `.jpg` > `.jpeg` > `.webp`

### 2. Analisar TODAS as imagens encontradas

Para cada imagem, chamar `understand_image`:

```
understand_image({
  prompt: "Descreva esta imagem em detalhes. Inclua todo texto visível, layout, cores de elementos, e contexto do que está sendo mostrado. Seja muito específico.",
  image_url: "/caminho/da/imagem.png"
})
```

### 3. Responder ao usuário

Usar a descrição para responder diretamente o que ele perguntou.

---

## Prompts otimizados por situação

| Situação | Prompt |
|----------|--------|
| Geral | `"Descreva esta imagem em detalhes. Inclua todo texto visível, layout, cores, e contexto."` |
| Bug/Erro | `"O que está errado nesta tela? Identifique todos os problemas visuais, erros, ou anomalias."` |
| OCR/Texto | `"Extraia todo texto visível nesta imagem, exatamente como aparece."` |
| UI/Interface | `"Descreva os elementos de interface, campos, botões, e o propósito desta tela."` |
| Código/Error | `"Identifique mensagens de erro, stack traces, ou código visível nesta imagem."` |

---

## Dicas

1. **Sempre busque a imagem** quando ver gatilho — não pergunte se deve fazer
2. **Se encontrar múltiplas imagens**, analise todas
3. **Se não encontrar imagem**, informe o usuário e peça que cole novamente
4. **image_url aceita:** caminhos locais (`/var/folders/...`), URLs HTTP, e prefixo `@` é removido automaticamente
5. **Formatos:** PNG, JPG, JPEG, WebP

---

## Exemplo de resposta ideal

```
Vi a imagem! Isso é a tela de "Realizar Saque" do app iEvo. 
Os campos são:
- Nome Completo
- Valor do Saque
- Banco
- Chave Pix / Tipo de Chave
- Agência / Dígito
- Conta / Dígito
- Tipo de Conta

O que você precisa fazer nessa tela?
```
