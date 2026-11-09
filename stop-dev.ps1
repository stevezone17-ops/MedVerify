<#
.SYNOPSIS
    MedVerify Development Shutdown Script
.DESCRIPTION
    Safely terminates MedVerify development processes on ports 8001 and 5173.
#>

$ErrorActionPreference = 'SilentlyContinue'

Write-Host '=======================================================' -ForegroundColor Cyan
Write-Host '       MedVerify Platform - Process Shutdown           ' -ForegroundColor Cyan
Write-Host '=======================================================' -ForegroundColor Cyan
Write-Host ''

function Stop-PortListener {
    param(
        [int]$Port,
        [string]$ServiceName
    )

    Write-Host "Checking $ServiceName on port $Port... " -NoNewline
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

    if (-not $connections) {
        Write-Host 'Idle (not running)' -ForegroundColor DarkGray
        return
    }

    $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $pids) {
        if ($procId -gt 0) {
            $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
            if ($p) {
                Write-Host ''
                Write-Host "  Stopping $ServiceName (PID: $procId, Name: $($p.ProcessName))..." -ForegroundColor Yellow
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                Start-Sleep -Milliseconds 500
            }
        }
    }

    $remaining = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $remaining) {
        Write-Host "  [OK] Port $Port is now clear." -ForegroundColor Green
    }
    else {
        Write-Host "  [WARN] Port $Port still occupied. Please check Task Manager." -ForegroundColor Red
    }
}

Stop-PortListener -Port 8001 -ServiceName 'MedVerify Backend (FastAPI)'
Stop-PortListener -Port 5173 -ServiceName 'MedVerify Frontend (Vite)'

Write-Host ''
Write-Host 'Shutdown completed.' -ForegroundColor Cyan
