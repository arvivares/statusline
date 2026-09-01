; Starting a WebView application from the installer inherits a transient
; installer environment. Keep the optional Finish-page launch disabled by
; default so the first normal launch comes from Start or the desktop shortcut.
!define MUI_FINISHPAGE_RUN_NOTCHECKED

!macro NSIS_HOOK_PREINSTALL
!macroend

!macro NSIS_HOOK_POSTINSTALL
!macroend

!macro NSIS_HOOK_PREUNINSTALL
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
!macroend
