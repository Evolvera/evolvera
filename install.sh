#!/bin/bash
set -e

# ──────────────────────────────────────────────
# Evolvera PI Setup — install.sh
# ──────────────────────────────────────────────

if [ "${1:-}" = "--prepare-usuario-entry" ]; then
    shift
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    exec node "$SCRIPT_DIR/scripts/users/entrypoints.mjs" "$@"
fi

GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PI_DIR="$HOME/.pi/agent"

# ── Corte seguro do Flow ───────────────────────
if [ -d "$SCRIPT_DIR/skills/flow-orca" ] && [ -d "$PI_DIR/skills/flow" ]; then
    echo "Atualização interrompida: o skill Flow Orca e o skill Flow legado estão presentes." >&2
    echo "Preserve o skill Flow legado e mova-o manualmente para fora da árvore de descoberta de skills ($PI_DIR/skills)." >&2
    echo "Nenhum skill foi movido ou apagado automaticamente." >&2
    echo "Preserve também os dados da campanha em .pi/flow; eles não são o skill legado." >&2
    exit 1
fi

PI_CODING_AGENT_VERSION="${PI_CODING_AGENT_VERSION:-0.83.0}"
MIN_NODE_VERSION="22.19.0"
same_root=false

info() { echo -e "${GREEN}[✓]${NC} $1"; }

failed_pi_packages=()
install_pi_package() {
    local package="$1"
    local label="$2"
    local output
    local status
    local reason

    if output="$(pi install "$package" 2>&1)"; then
        [ -z "$output" ] || printf '%s\n' "$output"
        info "$label"
        return 0
    else
        status=$?
    fi

    reason="${output##*$'\n'}"
    reason="${reason%$'\r'}"
    reason="${reason:0:240}"
    [ -n "$reason" ] || reason="sem detalhe informado"
    echo "[!] Falha ao instalar $package: $reason (código $status)." >&2
    failed_pi_packages+=("$package")
    return 1
}

# True when $1 is byte-identical to a version of config/rpiv-todo/config.json in this checkout's history.
todo_cfg_previously_shipped() {
    local rev
    git -C "$SCRIPT_DIR" rev-parse --git-dir >/dev/null 2>&1 || return 1
    for rev in $(git -C "$SCRIPT_DIR" log --format=%H -- config/rpiv-todo/config.json 2>/dev/null); do
        git -C "$SCRIPT_DIR" show "$rev:config/rpiv-todo/config.json" 2>/dev/null | cmp -s - "$1" && return 0
    done
    return 1
}
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
node "$SCRIPT_DIR/scripts/patch-pi-083-auth-load-recovery.mjs"
info "Recuperação de leitura de credenciais do PI 0.83.0 verificada"
node "$SCRIPT_DIR/scripts/patch-pi-083-context-wall-retry.mjs"
info "Retomada após compactação na parede de contexto verificada"
node "$SCRIPT_DIR/scripts/patch-pi-083-ultra-thinking.mjs"
info "Suporte a thinking ultra do PI 0.83.0 verificado"
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
# delivery-closure became midrun-compaction; the continuation reviewer was retired.
rm -f "$PI_DIR/extensions/delivery-closure.ts" "$PI_DIR/extensions/continuation-reviewer.ts" "$PI_DIR/continuation-reviewer.json"

# Remove retired agents so updates do not leave stale routes.
rm -f "$PI_DIR"/agents/{planner-heavy,builder-ultra,builder-light-design,scout-highspeed,deep-research-finalizer,deep-search-master}.md

if ls "$SCRIPT_DIR"/extensions/*.ts &>/dev/null; then
    cp "$SCRIPT_DIR"/extensions/*.ts "$PI_DIR/extensions/"
    info "$(ls "$SCRIPT_DIR"/extensions/*.ts | wc -l | tr -d ' ') extensões"
fi
# Maestro (automatic model selection) was retired; drop any installed copy.
rm -rf "$PI_DIR/extensions/maestro" "$PI_DIR/extensions/maestro.ts"
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
    if install_pi_package "npm:pi-mcp-adapter" "pi-mcp-adapter"; then :; fi
    if install_pi_package "npm:@tintinweb/pi-subagents@0.18.2" "pi-subagents"; then
        node "$SCRIPT_DIR/scripts/patch-pi-subagents-ultra-thinking.mjs"
        node "$SCRIPT_DIR/scripts/patch-pi-subagents-deferred-nudges.mjs"
        node "$SCRIPT_DIR/scripts/patch-pi-subagents-bounded-waits.mjs"
        node "$SCRIPT_DIR/scripts/patch-pi-subagents-hud.mjs"
        info "Suporte a thinking ultra dos subagentes verificado"
    else
        echo "[!] Pulando patch de pi-subagents: pacote não instalado." >&2
    fi
    if install_pi_package "npm:pi-alibaba-models@1.0.14" "pi-alibaba-models"; then :; fi
    if install_pi_package "npm:@narumitw/pi-goal@0.43.0" "pi-goal"; then :; fi
    if install_pi_package "npm:@juicesharp/rpiv-todo@2.11.0" "rpiv-todo"; then
        node "$SCRIPT_DIR/scripts/patch-rpiv-todo-hud.mjs"
    else
        echo "[!] Pulando patch de rpiv-todo: pacote não instalado." >&2
    fi
    # rpiv-todo reads guidance from its own config; ours allows parallel in_progress items.
    case "${XDG_CONFIG_HOME:-}" in /*) todo_cfg_root="$XDG_CONFIG_HOME" ;; *) todo_cfg_root="$HOME/.config" ;; esac
    todo_cfg="$todo_cfg_root/rpiv-todo/config.json"
    if [ ! -e "$todo_cfg" ]; then
        mkdir -p "$(dirname "$todo_cfg")" && cp "$SCRIPT_DIR/config/rpiv-todo/config.json" "$todo_cfg" && info "rpiv-todo guidance instalada"
    elif cmp -s "$SCRIPT_DIR/config/rpiv-todo/config.json" "$todo_cfg"; then
        info "rpiv-todo guidance atual"
    elif todo_cfg_previously_shipped "$todo_cfg"; then
        # Unmodified older shipped guidance is ours to upgrade; user edits stay preserved below.
        cp "$SCRIPT_DIR/config/rpiv-todo/config.json" "$todo_cfg" && info "rpiv-todo guidance atualizada"
    else
        echo "[!] rpiv-todo: $todo_cfg existente preservado; compare com config/rpiv-todo/config.json"
    fi
    if install_pi_package "npm:@gotgenes/pi-anthropic-auth@2.0.6" "pi-anthropic-auth"; then
        node "$SCRIPT_DIR/scripts/patch-anthropic-client-version.mjs"
        info "Compatibilidade OAuth Anthropic verificada"
    else
        echo "[!] Pulando patch de compatibilidade OAuth: pacote pi-anthropic-auth não instalado." >&2
    fi
    if install_pi_package "npm:@rahularya01/pi-cursor@1.4.39" "pi-cursor"; then
        node "$SCRIPT_DIR/scripts/patch-pi-cursor-reasoning-effort.mjs"
        info "Compatibilidade de reasoning effort do Cursor verificada"
    else
        echo "[!] Pulando patch de reasoning effort: pacote pi-cursor não instalado." >&2
    fi
    if install_pi_package "npm:pi-antigravity@0.10.0" "pi-antigravity"; then :; fi
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
if ((${#failed_pi_packages[@]})); then
    echo -e "  ${GREEN}Setup completo com ressalvas${NC}"
    echo "  Pacotes com falha: ${failed_pi_packages[*]}"
else
    echo -e "  ${GREEN}Setup completo!${NC}"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  1. Digite:  pi"
echo "  2. Faça login:  /login"
echo "  3. Pronto."
echo ""
echo "  VS Code: instale a extensão PI for VS Code"
echo "  https://marketplace.visualstudio.com/items?itemName=pi0.pi-vscode"
echo ""
