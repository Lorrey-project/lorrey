# Lorrey Services Startup Script
# This script launches all Lorrey services in separate PowerShell windows.

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrEmpty($ScriptDir)) {
    $ScriptDir = Get-Location
}

# Adjust script directory if we are in the root and there's a nested folder
$ProjectDir = Join-Path $ScriptDir "lorrey-project-code 2"
if (-not (Test-Path $ProjectDir)) {
    $ProjectDir = $ScriptDir
}

Write-Host "Starting all Lorrey services from project dir: $ProjectDir" -ForegroundColor Cyan

# 1. Backend Service
Write-Host "Launching Backend-Node..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "Set-Location '$ProjectDir\backend-node'; npm run dev"

# 2. AI Worker Service
Write-Host "Launching AI-Worker..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "Set-Location '$ProjectDir\ai-worker'; .\venv\Scripts\Activate.ps1; uvicorn pipeline:app --reload"

# 3. Frontend - Office Panel (Port 5173)
Write-Host "Launching Frontend Office Panel..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "Set-Location '$ProjectDir\frontend\review-dashboard\UI2'; npm run dev:office"

# 4. Frontend - Site Panel (Port 5174)
Write-Host "Launching Frontend Site Panel..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "Set-Location '$ProjectDir\frontend\review-dashboard\UI2'; `$env:VITE_PORTAL='site'; npx vite --port 5174 --host"

# 5. Frontend - Pump SAS1 Panel (Port 5175)
Write-Host "Launching Frontend Pump SAS1 Panel..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "Set-Location '$ProjectDir\frontend\review-dashboard\UI2'; `$env:VITE_PORTAL='sas1'; npx vite --port 5175 --host"

# 6. Frontend - Pump SAS2 Panel (Port 5176)
Write-Host "Launching Frontend Pump SAS2 Panel..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "Set-Location '$ProjectDir\frontend\review-dashboard\UI2'; `$env:VITE_PORTAL='sas2'; npx vite --port 5176 --host"

Write-Host "All services have been launched in separate windows!" -ForegroundColor Yellow
