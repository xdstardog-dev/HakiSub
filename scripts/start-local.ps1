param([Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$serverPath = Join-Path $projectDirectory 'server\index.mjs'
$serverProcess = Start-Process -FilePath $NodePath -ArgumentList @(('"{0}"' -f $serverPath), '--production') -WorkingDirectory $projectDirectory -WindowStyle Hidden -Wait -PassThru
exit $serverProcess.ExitCode
