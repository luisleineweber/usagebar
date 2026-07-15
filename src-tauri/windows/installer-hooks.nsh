!include "WinMessages.nsh"

!macro BroadcastEnvironmentChange
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ExecWait `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$p=[Environment]::GetEnvironmentVariable('Path','User'); if(-not (($p -split ';' | ForEach-Object { $_.Trim() }) -contains '$INSTDIR')) {[Environment]::SetEnvironmentVariable('Path', ($p.TrimEnd(';') + ';' + '$INSTDIR'), 'User')}"` $0
  !insertmacro BroadcastEnvironmentChange
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ExecWait `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$p=[Environment]::GetEnvironmentVariable('Path','User'); $q=($p -split ';' | Where-Object { $_.Trim() -and $_.Trim() -ne '$INSTDIR' }) -join ';'; [Environment]::SetEnvironmentVariable('Path', $q, 'User')"` $0
  !insertmacro BroadcastEnvironmentChange
!macroend
