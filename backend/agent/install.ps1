# Switchboard Agent installer for Windows (PowerShell)
# Usage:  $env:SWITCHBOARD_KEY="sk-..."; irm <server>/api/install.ps1 | iex
$ErrorActionPreference = "Stop"

$Server = if ($env:SWITCHBOARD_SERVER) { $env:SWITCHBOARD_SERVER } else { "__SERVER_URL__" }
$Key    = $env:SWITCHBOARD_KEY
$Name   = $env:SWITCHBOARD_NAME

function Info($m){ Write-Host "  $m" -ForegroundColor DarkGray }
function Ok($m){ Write-Host "  $m" -ForegroundColor Green }
function Die($m){ Write-Host "  $m" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  Switchboard Agent" -ForegroundColor Cyan
Write-Host ""

if (-not $Server -or $Server -eq "__SERVER_URL__") { $Server = Read-Host "  Server URL" }
$Server = $Server.TrimEnd('/')
if (-not $Server) { Die "Server URL is required." }

# Find Python (py launcher preferred, then python/python3)
$Py = $null
foreach ($c in @("py","python","python3")) {
    $cmd = Get-Command $c -ErrorAction SilentlyContinue
    if ($cmd) { $Py = $cmd.Source; break }
}
if (-not $Py) { Die "Python 3 not found. Install it from https://python.org and re-run." }

$InstallDir = Join-Path $env:USERPROFILE ".switchboard"
$Tmp = Join-Path $env:TEMP ("switchboard-" + [guid]::NewGuid().ToString("N").Substring(0,8))
New-Item -ItemType Directory -Force -Path $Tmp | Out-Null

Info "Downloading agent from $Server ..."
$tarball = Join-Path $Tmp "agent.tar.gz"
try { Invoke-WebRequest -Uri "$Server/api/agent-source" -OutFile $tarball -UseBasicParsing }
catch { Die "Download failed. Is the server running at $Server ?" }

Info "Extracting ..."
tar -xzf $tarball -C $Tmp
if ($LASTEXITCODE -ne 0) { Die "Extract failed (needs Windows 10+ which includes tar)." }

$Src = Join-Path $Tmp "switchboard-agent"
if (-not (Test-Path (Join-Path $Src "switchboard_agent"))) { Die "Package missing switchboard_agent/ folder." }

New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir "agent") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir "vendor") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir "bin") | Out-Null

Remove-Item -Recurse -Force (Join-Path $InstallDir "agent\switchboard_agent") -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force (Join-Path $Src "switchboard_agent") (Join-Path $InstallDir "agent\switchboard_agent")
if (Test-Path (Join-Path $Src "vendor\websockets")) {
    Remove-Item -Recurse -Force (Join-Path $InstallDir "vendor\websockets") -ErrorAction SilentlyContinue
    Copy-Item -Recurse -Force (Join-Path $Src "vendor\websockets") (Join-Path $InstallDir "vendor\websockets")
}
Ok "Agent installed to $InstallDir"

# .cmd launcher so `switchboard-agent` works in CMD/PowerShell
$AgentPath  = Join-Path $InstallDir "agent"
$VendorPath = Join-Path $InstallDir "vendor"
$BinDir     = Join-Path $InstallDir "bin"
@"
@echo off
set "PYTHONPATH=$VendorPath;$AgentPath;%PYTHONPATH%"
"$Py" -m switchboard_agent %*
"@ | Set-Content -Path (Join-Path $BinDir "switchboard-agent.cmd") -Encoding ASCII

# Add bin to the user's PATH (persists across terminals)
$userPath = [Environment]::GetEnvironmentVariable("PATH","User")
if ($userPath -notlike "*$BinDir*") {
    [Environment]::SetEnvironmentVariable("PATH", "$BinDir;$userPath", "User")
    Ok "Added to PATH (restart the terminal to use 'switchboard-agent')"
}

# Connect (saves server + key to config)
$env:PYTHONPATH = "$VendorPath;$AgentPath;$env:PYTHONPATH"
if (-not $Key) { $Key = Read-Host "  API key (sk-...)" }
if (-not $Key) {
    Write-Host ""
    Info "Installed but not connected. Connect with:"
    Write-Host "    switchboard-agent connect $Server --key YOUR_KEY"
    exit 0
}

$args = @("-m","switchboard_agent","connect",$Server,"--key",$Key)
if ($Name) { $args += @("--name",$Name) }
& $Py @args
if ($LASTEXITCODE -ne 0) { Die "Connection failed." }

Write-Host ""
Ok "Installation complete!"
Write-Host ""
Write-Host "  Next:" -ForegroundColor Cyan
Write-Host "    1. Start the agent:  switchboard-agent run"
Write-Host "    2. Approve the device in the web UI"
Write-Host ""
Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
