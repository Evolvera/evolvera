param(
    [int]$Port = 4123,
    [switch]$Stop,
    [switch]$NoWindow
)
$ErrorActionPreference = 'Stop'
$studioDir = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $env:LOCALAPPDATA 'PI Studio'
$logFile = Join-Path $logDir 'server.log'
$errorFile = Join-Path $logDir 'server-error.log'
$pidFile = Join-Path $logDir 'server.pid'
$url = "http://127.0.0.1:$Port"

function Test-StudioHealth {
    try {
        $page = Invoke-WebRequest -Uri "$url/" -UseBasicParsing -TimeoutSec 2
        if ($page.StatusCode -ne 200 -or $page.Content -notmatch 'name="pi-studio-token" content="([a-f0-9]+)"') { return $false }
        $token = $Matches[1]
        $response = Invoke-WebRequest -Uri "$url/api/health" -Headers @{ 'X-PI-Studio-Token' = $token } -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch { return $false }
}

function Open-StudioWindow {
    if ($NoWindow -or $env:PI_STUDIO_NO_WINDOW -eq '1') { return }
    $edge = Get-Command msedge.exe -ErrorAction SilentlyContinue
    if (-not $edge) {
        $edgePath = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
        if (Test-Path $edgePath) { $edge = @{ Source = $edgePath } }
    }
    if (-not $edge) {
        $edgePath = Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'
        if (Test-Path $edgePath) { $edge = @{ Source = $edgePath } }
    }
    $chrome = Get-Command chrome.exe -ErrorAction SilentlyContinue
    if (-not $chrome) {
        $chromePath = Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'
        if (Test-Path $chromePath) { $chrome = @{ Source = $chromePath } }
    }
    if (-not $chrome) {
        $chromePath = Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'
        if (Test-Path $chromePath) { $chrome = @{ Source = $chromePath } }
    }
    if ($edge) { Start-Process -FilePath $edge.Source -ArgumentList @("--app=$url"); return }
    if ($chrome) { Start-Process -FilePath $chrome.Source -ArgumentList @("--app=$url"); return }
    Start-Process $url
}

New-Item -ItemType Directory -Path $logDir -Force | Out-Null
if ($Stop) {
    if (Test-Path $pidFile) {
        $savedPid = 0
        [void][int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(), [ref]$savedPid)
        $process = if ($savedPid -gt 0) { Get-CimInstance Win32_Process -Filter "ProcessId = $savedPid" -ErrorAction SilentlyContinue } else { $null }
        if ($process -and $process.CommandLine -match 'server\.mjs') {
            Stop-Process -Id $savedPid -Force
        }
        Remove-Item -LiteralPath $pidFile -Force
    }
    exit 0
}

if (-not (Test-StudioHealth)) {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $node) { $node = Get-Command node -ErrorAction SilentlyContinue }
    if (-not $node) { throw 'Node.js nao encontrado no PATH.' }
    $server = Join-Path $studioDir 'server.mjs'
    $oldPort = $env:PI_WEB_PORT
    $oldHost = $env:PI_WEB_HOST
    try {
        $env:PI_WEB_PORT = "$Port"
        $env:PI_WEB_HOST = '127.0.0.1'
        $process = Start-Process -FilePath $node.Source -ArgumentList @('"' + $server + '"') -WorkingDirectory $studioDir -WindowStyle Hidden -PassThru -RedirectStandardOutput $logFile -RedirectStandardError $errorFile
    } finally {
        $env:PI_WEB_PORT = $oldPort
        $env:PI_WEB_HOST = $oldHost
    }
    Set-Content -LiteralPath $pidFile -Value $process.Id -NoNewline
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (Test-StudioHealth) { break }
        Start-Sleep -Milliseconds 500
    }
    if (-not (Test-StudioHealth)) { throw "PI Studio nao respondeu em ate 30 segundos. Consulte $logFile" }
}
Open-StudioWindow
