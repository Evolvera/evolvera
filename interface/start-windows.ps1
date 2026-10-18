# PI Studio launcher for Windows: starts the local server once (hidden) and opens it
# as a standalone app window (Edge/Chrome --app). Safe to run repeatedly.
param([int]$Port = 4123)

$ErrorActionPreference = "Stop"
$url = "http://127.0.0.1:$Port"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Test-Listening {
  [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

if (-not (Test-Listening)) {
  $node = (Get-Command node -ErrorAction Stop).Source
  $log = Join-Path $env:TEMP "pi-studio.log"
  $env:PI_WEB_PORT = "$Port"
  Start-Process -FilePath $node -ArgumentList "server.mjs" -WorkingDirectory $here `
    -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError "$log.err"
  for ($i = 0; $i -lt 50 -and -not (Test-Listening); $i++) { Start-Sleep -Milliseconds 200 }
  if (-not (Test-Listening)) { throw "PI Studio não subiu; veja $log.err" }
}

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
