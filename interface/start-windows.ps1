# PI Studio launcher for Windows: runs the app in Docker (docker compose) and opens it
# as a standalone app window (Edge/Chrome --app). Safe to run repeatedly.
#   -Rebuild  rebuild the image (after pulling harness/interface changes)
param([int]$Port = 4123, [switch]$Rebuild)

$ErrorActionPreference = "Stop"
$url = "http://127.0.0.1:$Port"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$compose = Join-Path $here "docker-compose.yml"

function Test-Up {
  try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 $url).StatusCode -eq 200 } catch { $false }
}

# Host paths for the bind mounts and the session path map, with forward slashes.
$env:PI_HOST_HOME = $env:USERPROFILE -replace '\\', '/'
# Same commit identity as the host git (optional).
# Run from this folder: a broken repo in the caller's cwd must not stop the launcher.
function Get-GitGlobal([string]$key) {
  try { (& git -C $here config --global $key 2>$null) } catch { "" }
}
$env:GIT_USER_NAME = Get-GitGlobal "user.name"
$env:GIT_USER_EMAIL = Get-GitGlobal "user.email"

docker info --format '{{.ServerVersion}}' *> $null
if ($LASTEXITCODE -ne 0) {
  $desktop = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $desktop) { Start-Process $desktop }
  for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 2
    docker info --format '{{.ServerVersion}}' *> $null
    if ($LASTEXITCODE -eq 0) { break }
  }
  if ($LASTEXITCODE -ne 0) { throw "Docker não está rodando. Abra o Docker Desktop e tente de novo." }
}

$composeArgs = @("compose", "-f", $compose, "up", "-d")
if ($Rebuild) { $composeArgs += "--build" }
docker @composeArgs
if ($LASTEXITCODE -ne 0) { throw "docker compose falhou." }

for ($i = 0; $i -lt 60 -and -not (Test-Up); $i++) { Start-Sleep -Milliseconds 500 }
if (-not (Test-Up)) { throw "PI Studio não respondeu em $url; veja: docker logs pi-studio" }

$browsers = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$browser = $browsers | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if ($browser) {
  Start-Process -FilePath $browser -ArgumentList "--app=$url", "--window-size=1500,950"
} else {
  Start-Process $url
}
