# Install openclaw2go CLI for Windows
# Usage: irm https://openclaw2go.io/install.ps1 | iex

$ErrorActionPreference = "Stop"

$Repo = "runpod-workers/openclaw2go-cli"
$Binary = "openclaw2go"
$Asset = "${Binary}-windows-amd64.exe"

# Get latest release tag
Write-Host "Finding latest release..."
$Release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest"
$Tag = $Release.tag_name

if (-not $Tag) {
    Write-Host "Could not find latest release."
    Write-Host "Check https://github.com/$Repo/releases"
    exit 1
}

$Url = "https://github.com/$Repo/releases/download/$Tag/$Asset"

Write-Host "Downloading $Binary $Tag for windows/amd64..."
Write-Host "  $Url"

# Install directory
$InstallDir = "$env:LOCALAPPDATA\openclaw2go"
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
Write-Host "Run 'openclaw2go version' to verify the installation."
