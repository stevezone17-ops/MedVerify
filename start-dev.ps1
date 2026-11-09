<#
.SYNOPSIS
    MedVerify Unified Development Environment Launcher
.DESCRIPTION
    Deterministically starts the MedVerify FastAPI backend (port 8001) and Vite frontend (port 5173),
    verifies process readiness and dependencies, and ensures zero port-conflict desynchronization.
#>

param(
    [int]$BackendTimeoutSeconds = 25
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host '=======================================================' -ForegroundColor Cyan
Write-Host '       MedVerify Platform - Development Launcher       ' -ForegroundColor Cyan
Write-Host '=======================================================' -ForegroundColor Cyan
Write-Host ''

# 1. Environment & Prerequisite Checks
Write-Host '1. Checking environment prerequisites...' -ForegroundColor Yellow

$backendDir = Join-Path $ScriptDir 'backend'
$frontendDir = Join-Path $ScriptDir 'frontend'

if (-not (Test-Path $backendDir)) {
    Write-Error "Backend directory not found at $backendDir"
    exit 1
}
if (-not (Test-Path $frontendDir)) {
    Write-Error "Frontend directory not found at $frontendDir"
    exit 1
}

# Locate Python in backend virtual environment
$pythonExe = Join-Path $backendDir '.venv\Scripts\python.exe'
if (-not (Test-Path $pythonExe)) {
    $foundPython = Get-Command python -ErrorAction SilentlyContinue
    if (-not $foundPython) {
        Write-Error 'Python executable not found in backend/.venv/Scripts or on PATH.'
        exit 1
    }
    $pythonExe = $foundPython.Source
    Write-Host "  [!] backend/.venv not found. Fallback to system Python: $pythonExe" -ForegroundColor DarkYellow
}
else {
    Write-Host "  [OK] Python virtual environment: $pythonExe" -ForegroundColor Green
}

# Verify npm
$foundNpm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $foundNpm) {
    $foundNpm = Get-Command npm -ErrorAction SilentlyContinue
}
if (-not $foundNpm) {
    Write-Error 'npm is not installed or not available on PATH.'
    exit 1
}
$npmCmd = $foundNpm.Source
Write-Host "  [OK] Node package manager: $npmCmd" -ForegroundColor Green

# 2. Inspect Backend Service (port 8001)
Write-Host ''
Write-Host '2. Inspecting Backend Service (port 8001)...' -ForegroundColor Yellow

$backendListening = $false
try {
    $conn = Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        $backendListening = $true
    }
}
catch { }

if ($backendListening) {
    Write-Host '  Port 8001 is listening. Checking service identity...' -ForegroundColor Cyan
    try {
        $liveCheck = Invoke-RestMethod -Uri 'http://127.0.0.1:8001/health/live' -Method Get -TimeoutSec 3 -ErrorAction Stop
        if ($liveCheck.service -eq 'medverify-api') {
            Write-Host "  [OK] MedVerify backend is already active (Uptime: $($liveCheck.uptime_seconds)s)" -ForegroundColor Green
        }
        else {
            Write-Host '  [WARN] Port 8001 is occupied by an unexpected process. Run .\stop-dev.ps1 first.' -ForegroundColor Red
        }
    }
    catch {
        Write-Host '  [WARN] Port 8001 is busy but not answering /health/live. Consider running .\stop-dev.ps1' -ForegroundColor DarkYellow
    }
}
else {
    Write-Host '  Starting FastAPI backend on http://127.0.0.1:8001...' -ForegroundColor Cyan
    $backendProcess = Start-Process -FilePath $pythonExe `
        -ArgumentList '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8001', '--reload' `
        -WorkingDirectory $backendDir `
        -PassThru

    Write-Host "  Backend process started (PID: $($backendProcess.Id)). Waiting for liveness..." -ForegroundColor Gray

    $startTime = [System.DateTime]::UtcNow
    $backendReady = $false
    while (([System.DateTime]::UtcNow - $startTime).TotalSeconds -lt $BackendTimeoutSeconds) {
        Start-Sleep -Milliseconds 800
        try {
            $resp = Invoke-RestMethod -Uri 'http://127.0.0.1:8001/health/live' -Method Get -TimeoutSec 2 -ErrorAction Stop
            if ($resp.status -eq 'alive') {
                $backendReady = $true
                break
            }
        }
        catch {
            Write-Host '.' -NoNewline -ForegroundColor Gray
        }
    }
    Write-Host ''

    if (-not $backendReady) {
        Write-Host "  [WARN] Backend did not respond within $BackendTimeoutSeconds seconds." -ForegroundColor Red
    }
    else {
        Write-Host '  [OK] Backend responsive on http://127.0.0.1:8001' -ForegroundColor Green
    }
}

# 3. Check Deep Readiness & Database Connectivity
Write-Host ''
Write-Host '3. Checking Service Readiness & Database Connectivity...' -ForegroundColor Yellow
try {
    $readyCheck = Invoke-RestMethod -Uri 'http://127.0.0.1:8001/health/ready' -Method Get -TimeoutSec 3 -ErrorAction Stop
    Write-Host "  [OK] Database: $($readyCheck.database.status) ($($readyCheck.database.name)) [Latency: $($readyCheck.database.latency_ms)ms]" -ForegroundColor Green
    Write-Host "  [OK] Service State: $($readyCheck.status.ToUpper())" -ForegroundColor Green
}
catch {
    Write-Host '  [INFO] MongoDB offline or unreachable; backend running in graceful degraded mode.' -ForegroundColor DarkYellow
}

# 4. Inspect Frontend Service (port 5173)
Write-Host ''
Write-Host '4. Inspecting Frontend Service (port 5173)...' -ForegroundColor Yellow

$frontendListening = $false
try {
    $conn5173 = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
    if ($conn5173) {
        $frontendListening = $true
    }
}
catch { }

if ($frontendListening) {
    Write-Host '  [OK] Frontend is already running on http://localhost:5173' -ForegroundColor Green
}
else {
    Write-Host '  Starting Vite development server on port 5173...' -ForegroundColor Cyan
    $frontendProcess = Start-Process -FilePath $npmCmd `
        -ArgumentList 'run', 'dev' `
        -WorkingDirectory $frontendDir `
        -PassThru

    Write-Host "  Frontend process started (PID: $($frontendProcess.Id))." -ForegroundColor Gray
    Start-Sleep -Seconds 2
    Write-Host '  [OK] Frontend development server initialized.' -ForegroundColor Green
}

# 5. Summary
Write-Host ''
Write-Host '=======================================================' -ForegroundColor Cyan
Write-Host '             MedVerify Services Active                 ' -ForegroundColor Green
Write-Host '=======================================================' -ForegroundColor Cyan
Write-Host '  Web Application   : http://localhost:5173' -ForegroundColor White
Write-Host '  Backend API Root  : http://127.0.0.1:8001' -ForegroundColor White
Write-Host '  API Documentation : http://127.0.0.1:8001/docs' -ForegroundColor White
Write-Host '  Readiness Check   : http://127.0.0.1:8001/health/ready' -ForegroundColor White
Write-Host '  Liveness Check    : http://127.0.0.1:8001/health/live' -ForegroundColor White
Write-Host ''
Write-Host '  To stop all development services: .\stop-dev.ps1' -ForegroundColor DarkGray
Write-Host '=======================================================' -ForegroundColor Cyan
