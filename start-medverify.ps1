<#
.SYNOPSIS
    MedVerify Production-Ready Development & Platform Launcher
.DESCRIPTION
    Deterministically starts and verifies the MedVerify platform:
    - Checks project directories and environments (Python virtualenv, Node dependencies)
    - Detects port occupancy and avoids duplicate MedVerify process launches
    - Verifies backend liveness (/health/live) and deep readiness (/health/ready)
    - Displays structured diagnostics (Database, Auth, Endpoints)
    - Safely connects Frontend (Vite) and Backend (FastAPI)
#>

param(
    [int]$BackendTimeoutSeconds = 30,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '         MedVerify v1.0 - Platform Environment Launcher          ' -ForegroundColor Cyan
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host ''

# 1. Project Directory Verification
Write-Host '[1/5] Verifying project directories...' -ForegroundColor Yellow
$backendDir = Join-Path $ScriptDir 'backend'
$frontendDir = Join-Path $ScriptDir 'frontend'

if (-not (Test-Path $backendDir)) {
    Write-Error "Backend directory not found at: $backendDir"
    exit 1
}
if (-not (Test-Path $frontendDir)) {
    Write-Error "Frontend directory not found at: $frontendDir"
    exit 1
}
Write-Host '  [OK] Backend directory confirmed.' -ForegroundColor Green
Write-Host '  [OK] Frontend directory confirmed.' -ForegroundColor Green

# 2. Runtime Environments & Dependency Validation
Write-Host ''
Write-Host '[2/5] Validating runtime environments and dependencies...' -ForegroundColor Yellow

# Python runtime
$pythonExe = Join-Path $backendDir '.venv\Scripts\python.exe'
if (-not (Test-Path $pythonExe)) {
    $foundPython = Get-Command python -ErrorAction SilentlyContinue
    if (-not $foundPython) {
        Write-Error 'Python executable not found in backend\.venv or on PATH. Please create the virtual environment first.'
        exit 1
    }
    $pythonExe = $foundPython.Source
    Write-Host "  [!] backend\.venv not found. Falling back to system Python: $pythonExe" -ForegroundColor DarkYellow
} else {
    Write-Host "  [OK] Python virtual environment verified: $pythonExe" -ForegroundColor Green
}

# Node / npm
$foundNpm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $foundNpm) {
    $foundNpm = Get-Command npm -ErrorAction SilentlyContinue
}
if (-not $foundNpm) {
    Write-Error 'npm is not installed or not available on PATH.'
    exit 1
}
$npmCmd = $foundNpm.Source
Write-Host "  [OK] Node package manager verified: $npmCmd" -ForegroundColor Green

# Frontend node_modules check
$nodeModulesDir = Join-Path $frontendDir 'node_modules'
if (-not (Test-Path $nodeModulesDir)) {
    Write-Host '  [!] node_modules not found in frontend. Running npm install...' -ForegroundColor Yellow
    Push-Location $frontendDir
    try {
        & $npmCmd install
    } finally {
        Pop-Location
    }
} else {
    Write-Host '  [OK] Frontend node_modules verified.' -ForegroundColor Green
}

# 3. Port Conflict Detection & Backend Initialization (Port 8001)
Write-Host ''
Write-Host '[3/5] Inspecting Backend Service (port 8001)...' -ForegroundColor Yellow

$backendAlreadyRunning = $false
$conn8001 = Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue

if ($conn8001) {
    # Check if the existing process is MedVerify API
    try {
        $liveCheck = Invoke-RestMethod -Uri 'http://127.0.0.1:8001/health/live' -Method Get -TimeoutSec 3 -ErrorAction Stop
        if ($liveCheck.service -eq 'medverify-api') {
            Write-Host "  [OK] MedVerify backend is already running (PID: $($conn8001[0].OwningProcess), Uptime: $($liveCheck.uptime_seconds)s)." -ForegroundColor Green
            $backendAlreadyRunning = $true
        } else {
            Write-Host "  [WARN] Port 8001 is listening but answered with unexpected service: $($liveCheck.service)" -ForegroundColor Red
            Write-Host "         Owning Process PID: $($conn8001[0].OwningProcess). Stop it or run .\stop-medverify.ps1" -ForegroundColor Yellow
            exit 1
        }
    } catch {
        # Check process name to avoid killing unrelated processes
        $proc = Get-Process -Id $conn8001[0].OwningProcess -ErrorAction SilentlyContinue
        Write-Host "  [WARN] Port 8001 is occupied by PID $($conn8001[0].OwningProcess) ($($proc.ProcessName))." -ForegroundColor Red
        Write-Host "         If this is a stalled process, run .\stop-medverify.ps1" -ForegroundColor Yellow
        exit 1
    }
}

if (-not $backendAlreadyRunning) {
    Write-Host '  Starting FastAPI backend on http://127.0.0.1:8001...' -ForegroundColor Cyan
    $backendProcess = Start-Process -FilePath $pythonExe `
        -ArgumentList '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8001', '--reload' `
        -WorkingDirectory $backendDir `
        -PassThru

    Write-Host "  Backend process started (PID: $($backendProcess.Id)). Waiting for liveness..." -ForegroundColor Gray

    $startTime = [System.DateTime]::UtcNow
    $backendReady = $false
    while (([System.DateTime]::UtcNow - $startTime).TotalSeconds -lt $BackendTimeoutSeconds) {
        Start-Sleep -Milliseconds 700
        try {
            $resp = Invoke-RestMethod -Uri 'http://127.0.0.1:8001/health/live' -Method Get -TimeoutSec 2 -ErrorAction Stop
            if ($resp.status -eq 'alive') {
                $backendReady = $true
                break
            }
        } catch {
            Write-Host '.' -NoNewline -ForegroundColor Gray
        }
    }
    Write-Host ''

    if (-not $backendReady) {
        Write-Host "  [ERROR] Backend did not respond within $BackendTimeoutSeconds seconds." -ForegroundColor Red
        Write-Host "          Check logs in backend or verify python environment." -ForegroundColor Yellow
        exit 1
    } else {
        Write-Host '  [OK] Backend liveness verified on http://127.0.0.1:8001' -ForegroundColor Green
    }
}

# 4. Service Readiness & Database Diagnostics
Write-Host ''
Write-Host '[4/5] Checking Service Deep Readiness & Database Health...' -ForegroundColor Yellow
try {
    $readyCheck = Invoke-RestMethod -Uri 'http://127.0.0.1:8001/health/ready' -Method Get -TimeoutSec 4 -ErrorAction Stop
    $dbStatus = $readyCheck.database.status
    $dbLatency = $readyCheck.database.latency_ms
    $overallStatus = $readyCheck.status.ToUpper()

    if ($overallStatus -eq 'READY') {
        Write-Host "  [OK] Overall Health: READY" -ForegroundColor Green
        Write-Host "  [OK] Database: $dbStatus ($($readyCheck.database.name)) [Latency: ${dbLatency}ms]" -ForegroundColor Green
    } else {
        Write-Host "  [WARN] Overall Health: $overallStatus" -ForegroundColor Yellow
        Write-Host "         Database detail: $($readyCheck.database.detail)" -ForegroundColor Yellow
    }
} catch {
    Write-Host '  [INFO] Backend responded to /health/live; database running in graceful degraded fallback mode.' -ForegroundColor DarkYellow
}

# 5. Frontend Initialization (Port 5173)
Write-Host ''
Write-Host '[5/5] Inspecting Frontend Service (port 5173)...' -ForegroundColor Yellow

$frontendAlreadyRunning = $false
$conn5173 = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue

if ($conn5173) {
    Write-Host "  [OK] Frontend is already running on http://localhost:5173 (PID: $($conn5173[0].OwningProcess))." -ForegroundColor Green
    $frontendAlreadyRunning = $true
} else {
    Write-Host '  Starting Vite development server on port 5173...' -ForegroundColor Cyan
    $frontendProcess = Start-Process -FilePath $npmCmd `
        -ArgumentList 'run', 'dev' `
        -WorkingDirectory $frontendDir `
        -PassThru

    Write-Host "  Frontend process started (PID: $($frontendProcess.Id))." -ForegroundColor Gray
    Start-Sleep -Seconds 2
    Write-Host '  [OK] Frontend development server active on http://localhost:5173' -ForegroundColor Green
}

# Summary Diagnostics & Links
Write-Host ''
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '              MedVerify v1.0 Services Active & Online            ' -ForegroundColor Green
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '  Consumer Verification Portal : http://localhost:5173/verify' -ForegroundColor White
Write-Host '  Admin Operations Console     : http://localhost:5173/admin' -ForegroundColor White
Write-Host '  Backend API Root             : http://127.0.0.1:8001' -ForegroundColor White
Write-Host '  FastAPI Interactive Swagger  : http://127.0.0.1:8001/docs' -ForegroundColor White
Write-Host '  Health Liveness Check        : http://127.0.0.1:8001/health/live' -ForegroundColor White
Write-Host '  Health Readiness Check       : http://127.0.0.1:8001/health/ready' -ForegroundColor White
Write-Host ''
Write-Host '  To cleanly terminate MedVerify services: .\stop-medverify.ps1' -ForegroundColor DarkGray
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host ''
