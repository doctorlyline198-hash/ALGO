# ensure-dev.ps1
# Simple watcher to ensure backend (3001) and frontend (5173) dev servers are running.
# - Starts new PowerShell windows that run `npm run dev` in server and client folders when the ports are not listening.
# - Run this script once (it will loop). To stop: close this window or kill the process.

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$serverDir = Resolve-Path (Join-Path $scriptDir '..\server')
$clientDir = Resolve-Path (Join-Path $scriptDir '..\client')

function IsPortOpen($port) {
    try {
        $r = Test-NetConnection -ComputerName 'localhost' -Port $port -WarningAction SilentlyContinue
        return $r.TcpTestSucceeded -eq $true
    } catch {
        return $false
    }
}

function StartIfDown($port, $workdir) {
    if (-not (IsPortOpen $port)) {
        Write-Output "Port $port not open — starting dev in $workdir"
        # Start new PowerShell window that runs npm run dev and keeps the window open for debugging
        Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", "cd `"$workdir`"; npm run dev" -WorkingDirectory $workdir
    } else {
        Write-Output "Port $port is listening"
    }
}

Write-Output "Starting ensure-dev watcher. Server dir: $serverDir, Client dir: $clientDir"

while ($true) {
    try {
        StartIfDown 3001 $serverDir
        StartIfDown 5173 $clientDir
    } catch {
        Write-Output "Watcher error: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 5
}
