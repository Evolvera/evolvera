#!/bin/bash
set -e

# ──────────────────────────────────────────────
# Evolvera PI Setup — install.sh
# ──────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PI_DIR="$HOME/.pi/agent"

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ── Check PI is installed ─────────────────────
if ! command -v pi &>/dev/null; then
    warn "PI não encontrado. Instalando..."
    npm install -g @mariozechner/pi-coding-agent || error "Falha ao instalar PI"
    info "PI instalado"
fi

# ── Create directories ────────────────────────
mkdir -p "$PI_DIR"/{agents,skills,extensions,sessions,research}

# ── Copy base config ──────────────────────────
for f in settings.json SYSTEM.md AGENTS.md; do
    if [ -f "$SCRIPT_DIR/config/$f" ]; then
        cp "$SCRIPT_DIR/config/$f" "$PI_DIR/$f"
        info "Config: $f"
    fi
done

# ── Copy agents (overwrite = padronizado) ─────
cp "$SCRIPT_DIR"/agents/*.md "$PI_DIR/agents/"
info "Agents: $(ls "$SCRIPT_DIR"/agents/*.md | wc -l | tr -d ' ') arquivos"

# ── Copy skills ───────────────────────────────
for skill_dir in "$SCRIPT_DIR"/skills/*/; do
    skill_name="$(basename "$skill_dir")"
    mkdir -p "$PI_DIR/skills/$skill_name"
    cp -r "$skill_dir"* "$PI_DIR/skills/$skill_name/"
    info "Skill: $skill_name"
done

# ── Copy extensions ───────────────────────────
if ls "$SCRIPT_DIR"/extensions/*.ts &>/dev/null; then
    cp "$SCRIPT_DIR"/extensions/*.ts "$PI_DIR/extensions/"
    info "Extensions: $(ls "$SCRIPT_DIR"/extensions/*.ts | wc -l | tr -d ' ') arquivos"
fi

# ── MCP config: merge com existente, preserva keys ─
MCP_TEMPLATE="$SCRIPT_DIR/config/mcp.json"
MCP_USER="$PI_DIR/mcp.json"

if [ ! -f "$MCP_USER" ]; then
    # Primeira instalação — pede keys interativamente
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Configuração de API Keys"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    read -p "Minimax API Key (ou Enter para pular): " MINIMAX_KEY
    read -p "Z.AI API Key (ou Enter para pular): " ZAI_KEY

    # SynaBun path
    SYNABUN_PATH=$(npm list -g synabun 2>/dev/null | grep synabun | awk '{print $2}' || echo "")
    if [ -z "$SYNABUN_PATH" ]; then
        SYNABUN_PATH="$(npm root -g)/synabun/mcp-server/run.mjs"
    fi

    # Gera mcp.json com keys reais
    sed \
        -e "s|{{SYNABUN_PATH}}|$SYNABUN_PATH|g" \
        -e "s|{{MINIMAX_API_KEY}}|$MINIMAX_KEY|g" \
        -e "s|{{ZAI_API_KEY}}|$ZAI_KEY|g" \
        "$MCP_TEMPLATE" > "$MCP_USER"

    info "mcp.json criado com suas keys"
else
    # Já existe — merge servers novos, preserva keys existentes
    warn "mcp.json já existe — preservando suas API keys"

    # Detecta synabun path se não estiver configurado
    if ! grep -q "synabun" "$MCP_USER" 2>/dev/null; then
        SYNABUN_PATH="$(npm root -g)/synabun/mcp-server/run.mjs"
        # Adiciona SynaBun ao mcp existente
        python3 -c "
import json
with open('$MCP_USER') as f: cfg = json.load(f)
cfg.setdefault('mcpServers', {})
cfg['mcpServers']['SynaBun'] = {
    'command': 'node',
    'args': ['$SYNABUN_PATH'],
    'lifecycle': 'keep-alive',
    'exposeResources': False
}
with open('$MCP_USER', 'w') as f: json.dump(cfg, f, indent=2)
" 2>/dev/null || warn "Não consegui adicionar SynaBun automaticamente"
    fi
    info "mcp.json preservado"
fi

# ── Install deps ──────────────────────────────
# SynaBun
if ! npm list -g synabun &>/dev/null; then
    warn "Instalando SynaBun..."
    npm install -g synabun || warn "Falha ao instalar SynaBun (instale manualmente)"
fi

# ── Done ──────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}Evolvera PI Setup completo!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Configs:   $PI_DIR"
echo "  Agents:    $(ls "$PI_DIR/agents/"*.md | wc -l | tr -d ' ') agentes"
echo "  Skills:    $(ls "$PI_DIR/skills/" | wc -l | tr -d ' ') skills"
echo ""
echo "  Para atualizar: git pull && ./install.sh"
echo "  Para resetar MCP: rm $PI_DIR/mcp.json && ./install.sh"
echo ""
