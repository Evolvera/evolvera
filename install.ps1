# Evolvera PI Setup - install.ps1
# PowerShell 5.1+ compatible installer for Windows

$ErrorActionPreference = "Stop"

# Colors
$GREEN = "Green"
$CYAN = "Cyan"

$PI_CODING_AGENT_VERSION = $env:PI_CODING_AGENT_VERSION
if (-not $PI_CODING_AGENT_VERSION) { $PI_CODING_AGENT_VERSION = "0.82.1" }
$MIN_NODE_VERSION = [version]"22.19.0"

function Info($message) { Write-Host "[OK] $message" -ForegroundColor $GREEN }
function Step($name) { Write-Host "`n--- $name ---" -ForegroundColor $CYAN }

# Paths
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $SCRIPT_DIR) { $SCRIPT_DIR = $PWD.Path }
$PI_DIR = Join-Path $env:USERPROFILE ".pi\agent"

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
npm install -g ("@earendil-works/pi-coding-agent@" + $PI_CODING_AGENT_VERSION)
if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar a versao compativel do PI." }

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
Info ($dirs.Count.ToString() + " diretorios")

# -- Configs ----------------------------------------------
Step "Instalando configuracao"

$configs = @("settings.json", "models.json", "SYSTEM.md", "AGENTS.md")
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

# -- Agents -----------------------------------------------
$agents = Get-ChildItem -Path (Join-Path $SCRIPT_DIR "agents") -Filter "*.md" -ErrorAction SilentlyContinue
if ($agents) {
    $dest = Join-Path $PI_DIR "agents"
    Copy-Item $agents.FullName $dest -Force
    Info ($agents.Count.ToString() + " agentes")
}

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

# -- Extensions -------------------------------------------
$extensions = Get-ChildItem -Path (Join-Path $SCRIPT_DIR "extensions") -Filter "*.ts" -ErrorAction SilentlyContinue
if ($extensions) {
    $dest = Join-Path $PI_DIR "extensions"
    Copy-Item $extensions.FullName $dest -Force
    Info ($extensions.Count.ToString() + " extensoes")
}

# -- MCP Servers ------------------------------------------
Step "MCP Servers"

$mcpPath = Join-Path $PI_DIR "mcp.json"
$mcpSrc = Join-Path $SCRIPT_DIR "config\mcp.json"

if (-not (Test-Path $mcpPath)) {
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
    & pi install npm:@tintinweb/pi-subagents 2>$null

    Info "pi-alibaba-models..."
    & pi install npm:pi-alibaba-models 2>$null

    Info "pi-provider-kimi-code..."
    & pi install npm:pi-provider-kimi-code 2>$null
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
