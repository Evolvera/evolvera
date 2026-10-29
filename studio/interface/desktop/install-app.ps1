param(
    [Parameter(Mandatory=$true)][string]$StudioDir,
    [Parameter(Mandatory=$true)][string]$DesktopDir,
    [Parameter(Mandatory=$true)][string]$StartMenuDir
)
$ErrorActionPreference = 'Stop'
$icon = Join-Path $StudioDir 'desktop\pi-studio.ico'
# The person's own icon (pi-studio-data\studio-icone.ico, e.g. Vorcaro's face) wins over the bundled one.
$custom = Join-Path (Split-Path $StudioDir -Parent) 'pi-studio-data\studio-icone.ico'
if (Test-Path $custom) {
    # Windows caches a shortcut's icon by file path: a copy named after its content makes a new icon show up at once.
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $custom).Hash.Substring(0, 10).ToLowerInvariant()
    $icon = Join-Path (Split-Path $custom -Parent) "studio-icone-$hash.ico"
    if (-not (Test-Path $icon)) { Copy-Item -LiteralPath $custom -Destination $icon }
}
$launcher = Join-Path $StudioDir 'desktop\launch-windows.ps1'
$arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launcher + '"'
foreach ($directory in @($DesktopDir, $StartMenuDir)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $shortcutPath = Join-Path $directory 'PI Studio.lnk'
    $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
    $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $shortcut.Arguments = $arguments
    $shortcut.WorkingDirectory = $StudioDir
    $shortcut.IconLocation = "$icon,0"
    $shortcut.Save()
}
Write-Output 'PI Studio instalado: Area de Trabalho e Menu Iniciar'
