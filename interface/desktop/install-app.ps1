param(
    [Parameter(Mandatory=$true)][string]$StudioDir,
    [Parameter(Mandatory=$true)][string]$DesktopDir,
    [Parameter(Mandatory=$true)][string]$StartMenuDir
)
$ErrorActionPreference = 'Stop'
$icon = Join-Path $StudioDir 'desktop\pi-studio.ico'
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
