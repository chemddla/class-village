# 상시 테스트 서버 두 개를 작업 스케줄러에 등록한다 (한 번만 실행하면 됨, 다시 실행하면 설정을 덮어씀)
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\install-live-server.ps1
#
#   로컬용      http://localhost:5173 (게임 2567) : 이 컴퓨터의 작업 폴더 그대로 (커밋 안 한 내용도 바로 보임)
#   동시 작업용 http://localhost:5180 (게임 2577) : 원격 main을 몇 초마다 받아와 보여 줌 (어느 컴퓨터에서 푸시하든 반영)
#
# 지우려면: Unregister-ScheduledTask -TaskName 'ClassVillage live test server' -Confirm:$false
#           Unregister-ScheduledTask -TaskName 'ClassVillage live main server' -Confirm:$false
$repo = Split-Path $PSScriptRoot -Parent
$node = (Get-Command node).Source
$logDir = Join-Path $env:LOCALAPPDATA 'ClassVillage'
$servers = @(
  @{ Name = 'ClassVillage live test server'; Args = ''; Log = 'live-server.log'; Desc = '우리 반 마을 로컬 테스트 서버(localhost:5173, 작업 폴더)를 늘 켜 둔다' },
  @{ Name = 'ClassVillage live main server'; Args = ' --main'; Log = 'live-main-server.log'; Desc = '우리 반 마을 동시 작업 테스트 서버(localhost:5180, 원격 main)를 늘 켜 둔다' }
)
foreach ($s in $servers) {
  $log = Join-Path $logDir $s.Log # 켤 때마다 새로 씀
  # 창 없이 켠다 (conhost --headless): 로그인할 때마다 검은 창이 뜨지 않게
  $action = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\conhost.exe" `
    -Argument "--headless `"$node`" tools\live-server.cjs$($s.Args) --log `"$log`"" -WorkingDirectory $repo
  # 로그인할 때 켜고, 2분마다 살아 있는지 본다 (이미 켜져 있으면 그냥 넘어감)
  $logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
  $every = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 2)
  $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
  Register-ScheduledTask -TaskName $s.Name -Action $action -Trigger $logon, $every -Settings $settings `
    -Description $s.Desc -Force | Out-Null
  Start-ScheduledTask -TaskName $s.Name
  Write-Output "등록함: $($s.Name)"
}
