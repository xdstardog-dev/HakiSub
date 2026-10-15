$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$nodePath = (Get-Command node -ErrorAction Stop).Source
$chromePath = @('C:\Program Files\Google\Chrome\Application\chrome.exe', 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe', (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (!$chromePath) { throw 'Chrome not found' }
if (!(Test-Path -LiteralPath (Join-Path $projectDirectory 'dist\index.html'))) { throw 'Run npm run build first' }
$taskName = 'HakiSub-Local'
$account = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -NodePath "{1}"' -f (Join-Path $PSScriptRoot 'start-local.ps1'), $nodePath
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $projectDirectory
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $account
$principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'HakiSub localhost website and ASR gateway; no automatic microphone capture.' -Force | Out-Null
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'HakiSub.lnk'
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
$shortcut.TargetPath = $chromePath
$shortcut.Arguments = 'http://127.0.0.1:8787/'
$shortcut.WorkingDirectory = $projectDirectory
$shortcut.Description = 'Open HakiSub in Chrome'
$shortcut.Save()
Write-Output "Registered $taskName; shortcut: $shortcutPath"
