#!/bin/bash
set -e

# ──────────────────────────────────────────────
# Evolvera PI Setup — install.sh
# ──────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PI_DIR="$HOME/.pi/agent"

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }
step()  { echo -e "\n${CYAN}── $1 ──${NC}"; }

# ──────────────────────────────────────────────
# Step 1: Instalar PI
# ──────────────────────────────────────────────
step "Verificando PI"

if ! command -v pi &>/dev/null; then
    warn "PI não encontrado. Instalando..."
    npm install -g @mariozechner/pi-coding-agent || error "Falha ao instalar PI. Precisa de Node.js 20+."
    info "PI instalado: $(pi --version 2>/dev/null || echo 'ok')"
else
    info "PI já instalado"
fi

# ──────────────────────────────────────────────
# Step 2: Criar diretórios
# ──────────────────────────────────────────────
step "Preparando diretórios"

mkdir -p "$PI_DIR"/{agents,skills,extensions,sessions,research,helpers,bin}

# ──────────────────────────────────────────────
# Step 3: Copiar configuração
# ──────────────────────────────────────────────
step "Instalando configuração"

for f in settings.json SYSTEM.md AGENTS.md; do
    if [ -f "$SCRIPT_DIR/config/$f" ]; then
        cp "$SCRIPT_DIR/config/$f" "$PI_DIR/$f"
        info "$f"
    fi
done

# ──────────────────────────────────────────────
# Step 4: Copiar agents, skills, extensions
# ──────────────────────────────────────────────
cp "$SCRIPT_DIR"/agents/*.md "$PI_DIR/agents/" 2>/dev/null && info "$(ls "$SCRIPT_DIR"/agents/*.md 2>/dev/null | wc -l | tr -d ' ') agentes copiados"

for skill_dir in "$SCRIPT_DIR"/skills/*/; do
    [ -d "$skill_dir" ] || continue
    skill_name="$(basename "$skill_dir")"
    mkdir -p "$PI_DIR/skills/$skill_name"
    cp -r "$skill_dir"* "$PI_DIR/skills/$skill_name/"
    info "Skill: $skill_name"
done

if ls "$SCRIPT_DIR"/extensions/*.ts &>/dev/null; then
    cp "$SCRIPT_DIR"/extensions/*.ts "$PI_DIR/extensions/"
    info "$(ls "$SCRIPT_DIR"/extensions/*.ts | wc -l | tr -d ' ') extensões copiadas"
fi

# ──────────────────────────────────────────────
# Step 5: API Keys para o modelo (auth.json)
# ──────────────────────────────────────────────
step "API Keys — Modelo de IA"

AUTH_FILE="$PI_DIR/auth.json"
NEED_AUTH=false

# Verifica se já tem auth.json com as keys necessárias
if [ -f "$AUTH_FILE" ]; then
    HAS_ZAI=$(grep -c '"zai"' "$AUTH_FILE" 2>/dev/null || echo "0")
    HAS_KIMI=$(grep -c '"kimi-coding"' "$AUTH_FILE" 2>/dev/null || echo "0")
    HAS_MINIMAX=$(grep -c '"minimax"' "$AUTH_FILE" 2>/dev/null || echo "0")

    if [ "$HAS_ZAI" -gt 0 ] && [ "$HAS_MINIMAX" -gt 0 ]; then
        info "auth.json já configurado (pulando)"
        SKIP_AUTH=true
    else
        NEED_AUTH=true
    fi
else
    NEED_AUTH=true
fi

if [ "$NEED_AUTH" = true ]; then
    echo ""
    echo "  O PI precisa de API keys para funcionar."
    echo "  Estas keys vão para ~/.pi/agent/auth.json (não são commitadas)."
    echo ""
    echo "  Onde conseguir:"
    echo "    ZAI:     https://z.ai  → Settings → API Keys"
    echo "    Minimax: https://minimax.io → Dashboard → API Keys"
    echo "    Kimi:    https://platform.moonshot.cn → API Keys"
    echo ""

    read -p "  ZAI API Key (obrigatório): " ZAI_KEY
    read -p "  Minimax API Key (obrigatório): " MINIMAX_KEY
    read -p "  Kimi API Key (opcional, Enter para pular): " KIMI_KEY

    if [ -z "$ZAI_KEY" ] || [ -z "$MINIMAX_KEY" ]; then
        error "ZAI e Minimax são obrigatórios. Rode ./install.sh de novo."
    fi

    # Monta auth.json
    cat > "$AUTH_FILE" << AUTHJSON
{
  "zai": {
    "type": "api_key",
    "key": "$ZAI_KEY"
  },
  "minimax": {
    "type": "api_key",
    "key": "$MINIMAX_KEY"
  }$([ -n "$KIMI_KEY" ] && echo ",
  \"kimi-coding\": {
    \"type\": \"api_key\",
    \"key\": \"$KIMI_KEY\"
  }")
}
AUTHJSON
    chmod 600 "$AUTH_FILE"
    info "auth.json criado"
fi

# ──────────────────────────────────────────────
# Step 6: MCP config
# ──────────────────────────────────────────────
step "Configurando MCP Servers"

MCP_USER="$PI_DIR/mcp.json"

# Descobre synabun path
SYNABUN_PATH="$(npm root -g 2>/dev/null)/synabun/mcp-server/run.mjs"

if [ ! -f "$MCP_USER" ]; then
    # Lê keys do auth.json que acabou de criar ou que já existia
    ZAI_MCP=$(python3 -c "import json; print(json.load(open('$AUTH_FILE'))['zai']['key'])" 2>/dev/null || echo "")
    MINIMAX_MCP=$(python3 -c "import json; print(json.load(open('$AUTH_FILE'))['minimax']['key'])" 2>/dev/null || echo "")

    cat > "$MCP_USER" << MCPCONF
{
  "mcpServers": {
    "SynaBun": {
      "command": "node",
      "args": ["$SYNABUN_PATH"],
      "lifecycle": "keep-alive",
      "exposeResources": false
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "lifecycle": "keep-alive"
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"],
      "lifecycle": "lazy"
    },
    "minimax-web-search": {
      "command": "uvx",
      "args": ["minimax-coding-plan-mcp", "-y"],
      "env": {
        "MINIMAX_API_KEY": "$MINIMAX_MCP",
        "MINIMAX_API_HOST": "https://api.minimax.io"
      },
      "lifecycle": "eager"
    },
    "zai-web-reader": {
      "url": "https://api.z.ai/api/mcp/web_reader/mcp",
      "headers": {
        "Authorization": "Bearer $ZAI_MCP"
      },
      "lifecycle": "eager"
    },
    "zai-zread": {
      "url": "https://api.z.ai/api/mcp/zread/mcp",
      "headers": {
        "Authorization": "Bearer $ZAI_MCP"
      },
      "lifecycle": "eager"
    },
    "zai-web-search-prime": {
      "url": "https://api.z.ai/api/mcp/web_search_prime/mcp",
      "headers": {
        "Authorization": "Bearer $ZAI_MCP"
      },
      "lifecycle": "eager"
    }
  }
}
MCPCONF
    info "mcp.json criado (keys copiadas do auth.json)"
else
    warn "mcp.json já existe — preservado"
    info "Para resetar: rm ~/.pi/agent/mcp.json && ./install.sh"
fi

# ──────────────────────────────────────────────
# Step 7: Instalar deps dos MCPs
# ──────────────────────────────────────────────
step "Instalando dependências"

# SynaBun
if ! npm list -g synabun &>/dev/null 2>&1; then
    warn "Instalando SynaBun..."
    npm install -g synabun 2>/dev/null || warn "Falha ao instalar SynaBun — instale manualmente: npm i -g synabun"
else
    info "SynaBun já instalado"
fi

# uvx (necessário para Minimax MCP)
if ! command -v uvx &>/dev/null; then
    warn "uvx não encontrado. Instale com: pip install uvx"
    warn "O MCP minimax-web-search não vai funcionar sem ele."
else
    info "uvx disponível"
fi

# ──────────────────────────────────────────────
# Done
# ──────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}Setup completo!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Agora é só abrir um terminal e digitar:  pi"
echo ""
echo "  Modelo padrão: zai/glm-5.1 (configurado em settings.json)"
echo "  Para trocar modelo: digite /model dentro do PI"
echo ""
