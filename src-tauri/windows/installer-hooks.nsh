!include "WinMessages.nsh"
!include "LogicLib.nsh"

!macro BroadcastEnvironmentChange
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend

; A user can remove the install directory without running uninstall.exe.
; NSIS then sees the old uninstall key and tries to start a file that no
; longer exists. Remove only that stale current-user entry before install.
!macro NSIS_HOOK_PREINSTALL
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\UsageBar" "UninstallString"
  ${If} $0 != ""
    StrCpy $1 $0 1
    ${If} $1 == '"'
      StrCpy $0 $0 "" 1
      StrCpy $0 $0 -1
    ${EndIf}
    ${IfNot} ${FileExists} "$0"
      DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\UsageBar"
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "UsageBar"
  ${If} $0 != ""
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "UsageBar" "$INSTDIR\usagebar.exe"
  ${EndIf}
  ExecWait `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$p=[Environment]::GetEnvironmentVariable('Path','User'); if(-not (($p -split ';' | ForEach-Object { $_.Trim() }) -contains '$INSTDIR')) {[Environment]::SetEnvironmentVariable('Path', ($p.TrimEnd(';') + ';' + '$INSTDIR'), 'User')}"` $0
  !insertmacro BroadcastEnvironmentChange
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ExecWait `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$p=[Environment]::GetEnvironmentVariable('Path','User'); $q=($p -split ';' | Where-Object { $_.Trim() -and $_.Trim() -ne '$INSTDIR' }) -join ';'; [Environment]::SetEnvironmentVariable('Path', $q, 'User')"` $0
  !insertmacro BroadcastEnvironmentChange
!macroend
