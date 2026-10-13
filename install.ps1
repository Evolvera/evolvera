# Evolvera PI Setup - install.ps1
# PowerShell 5.1+ compatible installer for Windows

$ErrorActionPreference = "Stop"

# Colors
$GREEN = "Green"
$CYAN = "Cyan"

$PI_CODING_AGENT_VERSION = $env:PI_CODING_AGENT_VERSION
if (-not $PI_CODING_AGENT_VERSION) { $PI_CODING_AGENT_VERSION = "0.83.0" }
$MIN_NODE_VERSION = [version]"22.19.0"

function Info($message) { Write-Host "[OK] $message" -ForegroundColor $GREEN }
function Step($name) { Write-Host "`n--- $name ---" -ForegroundColor $CYAN }

# True when $target matches (ignoring line endings) a version of config/rpiv-todo/config.json in this checkout's history.
function Test-TodoCfgPreviouslyShipped($target) {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { return $false }
    $previousEncoding = [Console]::OutputEncoding
    try {
        [Console]::OutputEncoding = [Text.Encoding]::UTF8
        $current = (Get-Content -LiteralPath $target -Encoding UTF8) -join "`n"
        $revs = @(& git -C $SCRIPT_DIR log --format=%H -- config/rpiv-todo/config.json 2>$null)
        if ($LASTEXITCODE -ne 0) { return $false }
        foreach ($rev in $revs) {
            $shipped = @(& git -C $SCRIPT_DIR show "${rev}:config/rpiv-todo/config.json" 2>$null)
            if ($LASTEXITCODE -eq 0 -and (($shipped -join "`n") -ceq $current)) { return $true }
        }
        return $false
    } catch {
        return $false
    } finally {
        [Console]::OutputEncoding = $previousEncoding
    }
}

# Paths
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $SCRIPT_DIR) { $SCRIPT_DIR = $PWD.Path }
$PI_DIR = Join-Path $env:USERPROFILE ".pi\agent"

# -- Corte seguro do Flow ---------------------------------
if (
    (Test-Path (Join-Path $SCRIPT_DIR "skills\flow-orca") -PathType Container) -and
    (Test-Path (Join-Path $PI_DIR "skills\flow") -PathType Container)
) {
    throw ("Atualizacao interrompida: o skill Flow Orca e o skill Flow legado estao presentes. " +
        "Preserve o skill Flow legado e mova-o manualmente para fora da arvore de descoberta de skills (" +
        (Join-Path $PI_DIR "skills") + "). Nenhum skill foi movido ou apagado automaticamente. " +
        "Preserve tambem os dados da campanha em .pi/flow; eles nao sao o skill legado.")
}

$sameRoot = $false

# -- PI ---------------------------------------------------
Step "Verificando PI"

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { throw "Node.js nao encontrado. Instale Node 22.19.0 ou superior." }
$nodeVersion = [version]((& node --version).Trim().TrimStart("v"))
if ($nodeVersion -lt $MIN_NODE_VERSION) {
    throw ("Node " + $nodeVersion + " nao suportado. Use NVM para instalar Node 22.19.0 ou superior.")
}
Info ("Node " + $nodeVersion + " compativel")

Info ("Garantindo @earendil-works/pi-coding-agent@" + $PI_CODING_AGENT_VERSION + "...")
# No Windows, reinstalar o pacote global falha com EBUSY enquanto o PI esta em
# execucao (modulo nativo travado). Se a versao exata ja estiver instalada, a
# reinstalacao e desnecessaria e o restante da atualizacao pode prosseguir.
# `npm.cmd` explicito: o shim `npm.ps1` corrompe os argumentos nesta forma de
# invocacao e devolveria "Unknown command".
$installedVersion = $null
try {
    # Sem `| Select-Object` aqui: filtrar no pipeline encerra npm.cmd cedo e
    # deixa $LASTEXITCODE = -1.
    $globalRootOutput = (& npm.cmd root -g)
    if ($LASTEXITCODE -eq 0 -and $globalRootOutput) {
        $globalRoot = @($globalRootOutput)[0]
        $installedManifest = Join-Path $globalRoot.Trim() "@earendil-works\pi-coding-agent\package.json"
        if (Test-Path $installedManifest) {
            $installedVersion = (Get-Content $installedManifest -Raw | ConvertFrom-Json).version
        }
    }
} catch {
    $installedVersion = $null
}
if ($installedVersion -eq $PI_CODING_AGENT_VERSION) {
    Info ("Versao " + $PI_CODING_AGENT_VERSION + " ja instalada; reinstalacao ignorada")
} else {
    npm install -g ("@earendil-works/pi-coding-agent@" + $PI_CODING_AGENT_VERSION)
    if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar a versao compativel do PI." }
}
& node (Join-Path $SCRIPT_DIR "scripts\patch-pi-083-threshold-cancel.mjs")
if ($LASTEXITCODE -ne 0) { throw "A versao instalada do PI recusou o patch de continuidade 0.83.0." }
Info "Patch de continuidade do PI 0.83.0 verificado"
& node (Join-Path $SCRIPT_DIR "scripts\patch-pi-083-context-wall-retry.mjs")
if ($LASTEXITCODE -ne 0) { throw "A versao instalada do PI recusou o patch de retomada na parede de contexto." }
Info "Retomada apos compactacao na parede de contexto verificada"
& node (Join-Path $SCRIPT_DIR "scripts\patch-pi-083-ultra-thinking.mjs")
if ($LASTEXITCODE -ne 0) { throw "A versao instalada do PI recusou o patch de thinking ultra 0.83.0." }
Info "Suporte a thinking ultra do PI 0.83.0 verificado"

$piCmd = Get-Command pi -ErrorAction SilentlyContinue
if (-not $piCmd) { throw "PI nao encontrado apos a instalacao." }
Info ("PI " + $PI_CODING_AGENT_VERSION + " instalado")

# -- Diretorios -------------------------------------------
Step "Preparando diretorios"

$dirs = @("agents", "skills", "extensions", "sessions", "research", "helpers", "bin", "themes")
foreach ($dir in $dirs) {
    $path = Join-Path $PI_DIR $dir
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
    }
}
$sameRoot = [StringComparer]::OrdinalIgnoreCase.Equals(
    [IO.Path]::GetFullPath($SCRIPT_DIR).TrimEnd([IO.Path]::DirectorySeparatorChar),
    [IO.Path]::GetFullPath($PI_DIR).TrimEnd([IO.Path]::DirectorySeparatorChar))
Info ($dirs.Count.ToString() + " diretorios")

# -- Configs ----------------------------------------------
Step "Instalando configuracao"

if (-not $sameRoot) {
    $configs = @("models.json", "SYSTEM.md", "AGENTS.md", "pi-goal.json")
    foreach ($f in $configs) {
        $src = Join-Path $SCRIPT_DIR "config\$f"
        $dst = Join-Path $PI_DIR $f
        if (Test-Path $src) {
            Copy-Item $src $dst -Force
            Info $f
        }
    }

    $subagentsSrc = Join-Path $SCRIPT_DIR "subagents.json"
    if (Test-Path $subagentsSrc) {
        Copy-Item $subagentsSrc (Join-Path $PI_DIR "subagents.json") -Force
        Info "subagents.json"
    }

    $themes = Get-ChildItem -Path (Join-Path $SCRIPT_DIR "themes") -Filter "*.json" -ErrorAction SilentlyContinue
    if ($themes) {
        Copy-Item $themes.FullName (Join-Path $PI_DIR "themes") -Force
        Info ($themes.Count.ToString() + " temas")
    }
}

if (-not $sameRoot) {
    # -- Agents -----------------------------------------------
    $retiredAgents = @("planner-heavy.md", "builder-ultra.md", "builder-light-design.md", "scout-highspeed.md", "deep-research-finalizer.md", "deep-search-master.md")
    foreach ($retired in $retiredAgents) {
        Remove-Item (Join-Path $PI_DIR "agents\$retired") -Force -ErrorAction SilentlyContinue
    }
    $agents = Get-ChildItem -Path (Join-Path $SCRIPT_DIR "agents") -Filter "*.md" -ErrorAction SilentlyContinue
    if ($agents) {
        $dest = Join-Path $PI_DIR "agents"
        Copy-Item $agents.FullName $dest -Force
        Info ($agents.Count.ToString() + " agentes")
    }
}

if (-not $sameRoot) {
    # -- Skills -----------------------------------------------
    $skillDirs = Get-ChildItem -Path (Join-Path $SCRIPT_DIR "skills") -Directory -ErrorAction SilentlyContinue
    foreach ($skillDir in $skillDirs) {
        $name = $skillDir.Name
        $dest = Join-Path $PI_DIR "skills\$name"
        if (-not (Test-Path $dest)) {
            New-Item -ItemType Directory -Path $dest -Force | Out-Null
        }
        Copy-Item (Join-Path $skillDir.FullName "*") $dest -Recurse -Force
        Info "Skill: $name"
    }
}

if (-not $sameRoot) {
    # -- Extensions -------------------------------------------
    Remove-Item (Join-Path $PI_DIR "extensions\goal-mode.ts") -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $PI_DIR "extensions\continuation-reviewer.ts") -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $PI_DIR "continuation-reviewer.json") -Force -ErrorAction SilentlyContinue
    $extensions = Get-ChildItem -Path (Join-Path $SCRIPT_DIR "extensions") -Filter "*.ts" -ErrorAction SilentlyContinue
    if ($extensions) {
        $dest = Join-Path $PI_DIR "extensions"
        Copy-Item $extensions.FullName $dest -Force
        Info ($extensions.Count.ToString() + " extensoes")
        # Maestro (automatic model selection) was retired; drop any installed copy.
        Remove-Item (Join-Path $dest "maestro") -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item (Join-Path $dest "maestro.ts") -Force -ErrorAction SilentlyContinue
    }
    # Plastic Memory is intentionally not installed while its compaction path is disabled.
    # Its project-memory bridge imports that tree, so neither may remain installed alone.
    Remove-Item (Join-Path $PI_DIR "extensions\project-memory.ts") -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $PI_DIR "extensions\plastic-memory") -Recurse -Force -ErrorAction SilentlyContinue
}

# -- MCP Servers ------------------------------------------
Step "MCP Servers"

$mcpPath = Join-Path $PI_DIR "mcp.json"
$mcpSrc = Join-Path $SCRIPT_DIR "config\mcp.json"

if ($sameRoot) {
    Info "origem e destino iguais - recursos preservados"
} elseif (-not (Test-Path $mcpPath)) {
    if (Test-Path $mcpSrc) {
        Copy-Item $mcpSrc $mcpPath -Force
        Info "mcp.json copiado de config/"
    } else {
        Info "config/mcp.json nao encontrado - pulando"
    }
} else {
    Info "mcp.json ja existe - preservado"
}

# -- Packages ---------------------------------------------
Step "Instalando packages"

$piCmd = Get-Command pi -ErrorAction SilentlyContinue
if ($piCmd) {
    Info "pi-mcp-adapter..."
    & pi install npm:pi-mcp-adapter 2>$null

    Info "pi-subagents..."
    & pi install npm:@tintinweb/pi-subagents@0.18.2 2>$null
    if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar pi-subagents." }
    & node (Join-Path $SCRIPT_DIR "scripts\patch-pi-subagents-ultra-thinking.mjs")
    if ($LASTEXITCODE -ne 0) { throw "pi-subagents recusou o patch de thinking ultra." }
    & node (Join-Path $SCRIPT_DIR "scripts\patch-pi-subagents-deferred-nudges.mjs")
    if ($LASTEXITCODE -ne 0) { throw "pi-subagents recusou o patch de avisos adiados." }
    & node (Join-Path $SCRIPT_DIR "scripts\patch-pi-subagents-bounded-waits.mjs")
    if ($LASTEXITCODE -ne 0) { throw "pi-subagents recusou o patch de timeouts limitados." }
    Info "Suporte a thinking ultra dos subagentes verificado"

    Info "pi-alibaba-models..."
    & pi install npm:pi-alibaba-models@1.0.14 2>$null

    Info "pi-goal..."
    & pi install npm:@narumitw/pi-goal@0.43.0 2>$null

    Info "rpiv-todo..."
    & pi install npm:@juicesharp/rpiv-todo@2.11.0 2>$null
    # rpiv-todo reads guidance from its own config; ours allows parallel in_progress items.
    $todoRoot = if ($env:XDG_CONFIG_HOME -and [System.IO.Path]::IsPathRooted($env:XDG_CONFIG_HOME)) { $env:XDG_CONFIG_HOME } else { Join-Path $HOME ".config" }
    $todoCfg = Join-Path (Join-Path $todoRoot "rpiv-todo") "config.json"
    $todoSrc = Join-Path $SCRIPT_DIR "config\rpiv-todo\config.json"
    if (-not (Test-Path $todoCfg)) {
        New-Item -ItemType Directory -Force -Path (Split-Path $todoCfg) | Out-Null
        Copy-Item $todoSrc $todoCfg
        Info "rpiv-todo guidance instalada"
    } elseif ((Get-FileHash $todoSrc).Hash -eq (Get-FileHash $todoCfg).Hash) {
        Info "rpiv-todo guidance atual"
    } elseif (Test-TodoCfgPreviouslyShipped $todoCfg) {
        # Unmodified older shipped guidance is ours to upgrade; user edits stay preserved below.
        Copy-Item $todoSrc $todoCfg -Force
        Info "rpiv-todo guidance atualizada"
    } else {
        Write-Host "[!] rpiv-todo: $todoCfg existente preservado; compare com config\rpiv-todo\config.json" -ForegroundColor Yellow
    }

    Info "pi-provider-kimi-code..."
    & pi install npm:pi-provider-kimi-code 2>$null

    Info "pi-anthropic-auth..."
    & pi install npm:@gotgenes/pi-anthropic-auth@2.0.6 2>$null
    if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar a compatibilidade OAuth Anthropic." }
    & node (Join-Path $SCRIPT_DIR "scripts\patch-anthropic-client-version.mjs")
    if ($LASTEXITCODE -ne 0) { throw "A compatibilidade OAuth Anthropic recusou o patch de versao do cliente." }
    Info "Compatibilidade OAuth Anthropic verificada"

    Info "pi-cursor..."
    & pi install npm:@rahularya01/pi-cursor@1.4.39 2>$null
    if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar pi-cursor." }
    & node (Join-Path $SCRIPT_DIR "scripts\patch-pi-cursor-reasoning-effort.mjs")
    if ($LASTEXITCODE -ne 0) { throw "A compatibilidade de reasoning effort do Cursor recusou o patch." }
    Info "Compatibilidade de reasoning effort do Cursor verificada"
    & node (Join-Path $SCRIPT_DIR "scripts\patch-openai-error-body.mjs")
    if ($LASTEXITCODE -ne 0) { throw "A normalização dos corpos de erro dos provedores recusou o patch." }
    Info "Normalização dos corpos de erro dos provedores verificada"
}

# Activating settings is intentionally the final staging write.
if (-not $sameRoot) {
    Copy-Item (Join-Path $SCRIPT_DIR "config\settings.json") (Join-Path $PI_DIR "settings.json") -Force
    Info "settings.json"
} else {
    Info "origem e destino iguais - settings.json preservado"
}

# -- Done -------------------------------------------------
Write-Host ""
Write-Host "========================================" -ForegroundColor $CYAN
Write-Host "  Setup completo!" -ForegroundColor $GREEN
Write-Host "========================================" -ForegroundColor $CYAN
Write-Host ""
Write-Host "  1. Digite:  pi"
Write-Host "  2. Faca login:  /login"
Write-Host "  3. Pronto."
Write-Host ""
Write-Host "  VS Code: instale a extensao PI for VS Code"
Write-Host "  https://marketplace.visualstudio.com/items?itemName=pi0.pi-vscode"
Write-Host ""
