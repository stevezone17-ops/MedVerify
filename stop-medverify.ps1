<#
.SYNOPSIS
    MedVerify Safe Process Termination Script
.DESCRIPTION
    Safely discovers and terminates MedVerify development processes:
    - Verifies process identity (checks that PID on port 8001 is python/uvicorn)
    - Verifies process identity (checks that PID on port 5173 is node/vite)
    - Never terminates unrelated applications or host processes
    - Verifies that ports are cleanly released
#>

$ErrorActionPreference = 'SilentlyContinue'

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '         MedVerify v1.0 - Safe Process Shutdown                  ' -ForegroundColor Cyan
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host ''

function Stop-MedVerifyPort {
    param(
        [int]$Port,
        [string]$ServiceName,
        [string[]]$ExpectedProcessPatterns
    )

    Write-Host "Inspecting $ServiceName on port $Port... " -NoNewline
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
                # Check if process matches expected patterns
                $matchesPattern = $false
                foreach ($pattern in $ExpectedProcessPatterns) {
                    if ($p.ProcessName -like "*$pattern*") {
                        $matchesPattern = $true
                        break
                    }
                }

                if ($matchesPattern) {
                    Write-Host ''
                    Write-Host "  Terminating $ServiceName (PID: $procId, Name: $($p.ProcessName))..." -ForegroundColor Yellow
                    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                    Start-Sleep -Milliseconds 600
                } else {
                    Write-Host ''
                    Write-Host "  [SKIPPED] PID $procId ($($p.ProcessName)) does not match expected patterns ($($ExpectedProcessPatterns -join ', ')). Not stopping." -ForegroundColor DarkYellow
                }
            }
        }
    }

    $remaining = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $remaining) {
        Write-Host "  [OK] Port $Port is clear." -ForegroundColor Green
    } else {
        Write-Host "  [INFO] Port $Port still has listeners or is closing." -ForegroundColor Gray
    }
}

Stop-MedVerifyPort -Port 8001 -ServiceName 'MedVerify Backend (FastAPI)' -ExpectedProcessPatterns @('python', 'uvicorn')
Stop-MedVerifyPort -Port 5173 -ServiceName 'MedVerify Frontend (Vite)' -ExpectedProcessPatterns @('node')

Write-Host ''
Write-Host 'Shutdown sequence completed.' -ForegroundColor Cyan
Write-Host ''
