# 상시 테스트 서버를 작업 스케줄러에 등록한다 (한 번만 실행하면 됨, 다시 실행하면 설정을 덮어씀)
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\install-live-server.ps1
# 지우려면: Unregister-ScheduledTask -TaskName 'ClassVillage live test server' -Confirm:$false
$name = 'ClassVillage live test server'
$repo = Split-Path $PSScriptRoot -Parent
$node = (Get-Command node).Source
$log = Join-Path $env:LOCALAPPDATA 'ClassVillage\live-server.log' # 켤 때마다 새로 씀
# 창 없이 켠다 (conhost --headless): 로그인할 때마다 검은 창이 뜨지 않게
$action = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\conhost.exe" `
  -Argument "--headless `"$node`" tools\live-server.cjs --log `"$log`"" -WorkingDirectory $repo
# 로그인할 때 켜고, 2분마다 살아 있는지 본다 (이미 켜져 있으면 그냥 넘어감)
$logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$every = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 2)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $name -Action $action -Trigger $logon, $every -Settings $settings `
  -Description '우리 반 마을 테스트 서버(localhost:5173)를 늘 켜 둔다' -Force | Out-Null
Start-ScheduledTask -TaskName $name
Write-Output "등록함: $name"
