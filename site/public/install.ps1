# Install a2go CLI for Windows
# Usage: irm https://a2go.run/install.ps1 | iex
#        .\install.ps1 -Version dev-feat-foo

param(
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"

$Repo = "runpod-labs/a2go"
$Binary = "a2go"
$Asset = "a2go_windows_amd64.exe"

# Get release tag
if ($Version) {
    Write-Host "Finding release for tag: $Version..."
    $Release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/tags/$Version"
} else {
    Write-Host "Finding latest release..."
    $Release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest"
}
$Tag = $Release.tag_name

if (-not $Tag) {
    Write-Host "Could not find release."
    Write-Host "Check https://github.com/$Repo/releases"
    exit 1
}

$Url = "https://github.com/$Repo/releases/download/$Tag/$Asset"

Write-Host "Downloading $Binary $Tag for windows/amd64..."
Write-Host "  $Url"

# Install directory
$InstallDir = "$env:LOCALAPPDATA\a2go"
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$DestPath = Join-Path $InstallDir "${Binary}.exe"

# Download
try {
    Invoke-WebRequest -Uri $Url -OutFile $DestPath -UseBasicParsing
} catch {
    Write-Host "Download failed: $_"
    exit 1
}

Write-Host "Installed to $DestPath"

# Add to PATH if not already there
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$UserPath;$InstallDir", "User")
    Write-Host ""
    Write-Host "Added $InstallDir to your PATH."
    Write-Host "Restart your terminal for the change to take effect."
} else {
    Write-Host "$InstallDir is already in your PATH."
}

Write-Host ""
Write-Host "Next: a2go doctor"
Write-Host ""
