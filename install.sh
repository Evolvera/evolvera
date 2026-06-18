#!/bin/bash
set -e

# ──────────────────────────────────────────────
# Evolvera PI Setup — install.sh
# ──────────────────────────────────────────────

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PI_DIR="$HOME/.pi/agent"

info() { echo -e "${GREEN}[✓]${NC} $1"; }
step() { echo -e "\n${CYAN}── $1 ──${NC}"; }

# ── PI ────────────────────────────────────────
step "Verificando PI"

if ! command -v pi &>/dev/null; then
    echo -e "${YELLOW}[!]${NC} PI não encontrado. Instalando..."
    npm install -g @mariozechner/pi-coding-agent
fi
info "PI instalado"

# ── Diretórios ────────────────────────────────
step "Preparando diretórios"
mkdir -p "$PI_DIR"/{agents,skills,extensions,sessions,research,helpers,bin}

# ── Configs ───────────────────────────────────
step "Instalando configuração"

for f in settings.json SYSTEM.md; do
    [ -f "$SCRIPT_DIR/config/$f" ] && cp "$SCRIPT_DIR/config/$f" "$PI_DIR/$f" && info "$f"
done

# ── Agents ────────────────────────────────────
cp "$SCRIPT_DIR"/agents/*.md "$PI_DIR/agents/" 2>/dev/null
info "$(ls "$SCRIPT_DIR"/agents/*.md 2>/dev/null | wc -l | tr -d ' ') agentes"

# ── Skills ────────────────────────────────────
for skill_dir in "$SCRIPT_DIR"/skills/*/; do
    [ -d "$skill_dir" ] || continue
    name="$(basename "$skill_dir")"
    mkdir -p "$PI_DIR/skills/$name"
    cp -r "$skill_dir"* "$PI_DIR/skills/$name/"
    info "Skill: $name"
done

# ── Extensions ────────────────────────────────
if ls "$SCRIPT_DIR"/extensions/*.ts &>/dev/null; then
    cp "$SCRIPT_DIR"/extensions/*.ts "$PI_DIR/extensions/"
    info "$(ls "$SCRIPT_DIR"/extensions/*.ts | wc -l | tr -d ' ') extensões"
fi

# ── MCP (só cria se não existe) ──────────────
step "MCP Servers"

if [ ! -f "$PI_DIR/mcp.json" ]; then
    if [ -f "$SCRIPT_DIR/config/mcp.json" ]; then
        cp "$SCRIPT_DIR/config/mcp.json" "$PI_DIR/mcp.json"
        info "mcp.json copiado de config/"
    else
        info "config/mcp.json nao encontrado - pulando"
    fi
else
    info "mcp.json ja existe - preservado"
fi

# ── PI Packages ─────────────────────────────
step "PI Packages"
if command -v pi &>/dev/null; then
    pi install npm:pi-mcp-adapter 2>/dev/null && info "pi-mcp-adapter" || true
    pi install npm:@tintinweb/pi-subagents 2>/dev/null && info "pi-subagents" || true
    pi install npm:pi-provider-kimi-code 2>/dev/null && info "pi-provider-kimi-code" || true
fi

# ── Done ──────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}Setup completo!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  1. Digite:  pi"
echo "  2. Faça login:  /login"
echo "  3. Pronto."
echo ""
echo "  VS Code: instale a extensão PI for VS Code"
echo "  https://marketplace.visualstudio.com/items?itemName=pi0.pi-vscode"
echo ""
