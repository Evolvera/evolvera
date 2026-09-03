#!/bin/bash
set -e

# ──────────────────────────────────────────────
# Evolvera PI Setup — install.sh
# ──────────────────────────────────────────────

GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PI_DIR="$HOME/.pi/agent"
PI_CODING_AGENT_VERSION="${PI_CODING_AGENT_VERSION:-0.83.0}"
MIN_NODE_VERSION="22.19.0"
same_root=false

info() { echo -e "${GREEN}[✓]${NC} $1"; }
step() { echo -e "\n${CYAN}── $1 ──${NC}"; }

# ── PI ────────────────────────────────────────
step "Verificando PI"

command -v node &>/dev/null || { echo "Node.js não encontrado. Instale Node $MIN_NODE_VERSION ou superior." >&2; exit 1; }
node -e '
const current = process.versions.node.split(".").map(Number);
const minimum = process.argv[1].split(".").map(Number);
for (let i = 0; i < 3; i++) {
  if (current[i] > minimum[i]) process.exit(0);
  if (current[i] < minimum[i]) process.exit(1);
}
' "$MIN_NODE_VERSION" || { echo "Node $(node --version) não suportado. Instale Node $MIN_NODE_VERSION ou superior." >&2; exit 1; }
info "Node $(node --version) compatível"

info "Garantindo @earendil-works/pi-coding-agent@$PI_CODING_AGENT_VERSION..."
npm install -g --ignore-scripts "@earendil-works/pi-coding-agent@$PI_CODING_AGENT_VERSION"
node "$SCRIPT_DIR/scripts/patch-pi-083-threshold-cancel.mjs"
info "Patch de continuidade do PI 0.83.0 verificado"
command -v pi &>/dev/null || { echo "PI não encontrado após a instalação." >&2; exit 1; }
info "PI $PI_CODING_AGENT_VERSION instalado"

# ── Diretórios ────────────────────────────────
step "Preparando diretórios"
mkdir -p "$PI_DIR"/{agents,skills,extensions,sessions,research,helpers,bin,themes}
if [ "$SCRIPT_DIR" -ef "$PI_DIR" ]; then
    same_root=true
fi

# ── Configs ───────────────────────────────────
step "Instalando configuração"

if [ "$same_root" = false ]; then
    for f in models.json SYSTEM.md pi-goal.json; do
        [ -f "$SCRIPT_DIR/config/$f" ] && cp "$SCRIPT_DIR/config/$f" "$PI_DIR/$f" && info "$f"
    done

if [ -f "$SCRIPT_DIR/config/keybindings.json" ]; then
    keybindings_status="$("$SCRIPT_DIR/scripts/install-wsl-keybindings.sh" \
        "$SCRIPT_DIR/config/keybindings.json" "$PI_DIR/keybindings.json")"
    case "$keybindings_status" in
        installed) info "keybindings.json" ;;
        preserved) info "keybindings.json ja existe - preservado" ;;
        skipped) : ;;
        *) echo "Status inesperado ao instalar keybindings.json." >&2; exit 1 ;;
    esac
fi

    [ -f "$SCRIPT_DIR/subagents.json" ] && cp "$SCRIPT_DIR/subagents.json" "$PI_DIR/subagents.json" && info "subagents.json"
    cp "$SCRIPT_DIR"/themes/*.json "$PI_DIR/themes/" 2>/dev/null && info "temas"
fi

if [ "$same_root" = false ]; then
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
# Remove retired harnesses so updates do not leave stale global commands/tools.
rm -f "$PI_DIR/extensions/plan-heavy.ts"
rm -f "$PI_DIR/extensions/goal-mode.ts"

# Remove retired agents so updates do not leave stale routes.
rm -f "$PI_DIR"/agents/{planner-heavy,builder-ultra,builder-light-design,scout-highspeed,deep-research-finalizer,deep-search-master}.md

if ls "$SCRIPT_DIR"/extensions/*.ts &>/dev/null; then
    cp "$SCRIPT_DIR"/extensions/*.ts "$PI_DIR/extensions/"
    info "$(ls "$SCRIPT_DIR"/extensions/*.ts | wc -l | tr -d ' ') extensões"
fi
# Plastic Memory is intentionally not installed while its compaction path is disabled.
# Its project-memory bridge imports that tree, so neither may remain installed alone.
rm -f "$PI_DIR/extensions/project-memory.ts"
rm -rf "$PI_DIR/extensions/plastic-memory"
fi

# ── MCP (só cria se não existe) ──────────────
step "MCP Servers"

if [ "$same_root" = false ]; then
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
else
    info "origem e destino iguais - recursos preservados"
fi

# ── PI Packages ─────────────────────────────
step "PI Packages"
if command -v pi &>/dev/null; then
    pi install npm:pi-mcp-adapter 2>/dev/null && info "pi-mcp-adapter" || true
    pi install npm:@tintinweb/pi-subagents@0.18.2 2>/dev/null && info "pi-subagents" || true
    pi install npm:pi-alibaba-models@1.0.14 2>/dev/null && info "pi-alibaba-models" || true
    pi install npm:@narumitw/pi-goal@0.43.0 2>/dev/null && info "pi-goal" || true
    pi install npm:@gotgenes/pi-anthropic-auth@2.0.6
    node "$SCRIPT_DIR/scripts/patch-anthropic-client-version.mjs"
    info "Compatibilidade OAuth Anthropic verificada"
    node "$SCRIPT_DIR/scripts/patch-openai-error-body.mjs"
    info "Normalização dos corpos de erro dos provedores verificada"
fi

# Activating settings is intentionally the final staging write.
if [ "$same_root" = false ]; then
    cp "$SCRIPT_DIR/config/settings.json" "$PI_DIR/settings.json"
    info "settings.json"
else
    info "origem e destino iguais - settings.json preservado"
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
