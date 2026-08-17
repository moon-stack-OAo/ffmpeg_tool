; 安装「完成」页勾选是否创建桌面快捷方式（默认勾选）
; 安装过程不自动创建桌面图标（electron-builder.yml: createDesktopShortcut: false）
; 函数写在 !macro 内，确保在 addplugindir 之后再展开（可用 StdUtils / isUpdated）

!ifndef BUILD_UNINSTALLER
  ; 静默安装无完成页：仅全新安装时默认创建桌面快捷方式
  !macro customInstall
    ${If} ${Silent}
      ${IfNot} ${isUpdated}
        CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
        ClearErrors
        WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
        System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
      ${EndIf}
    ${EndIf}
  !macroend

  !macro customFinishPage
    Function StartApp
      ${If} ${isUpdated}
        StrCpy $1 "--updated"
      ${Else}
        StrCpy $1 ""
      ${EndIf}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd

    Function CreateDesktopShortcutFromFinish
      CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
      System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
    FunctionEnd

    !ifndef HIDE_RUN_AFTER_FINISH
      !define MUI_FINISHPAGE_RUN
      !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
    !endif
    ; 完成页第二项勾选：创建桌面快捷方式（MUI 默认勾选）
    !define MUI_FINISHPAGE_SHOWREADME "$appExe"
    !define MUI_FINISHPAGE_SHOWREADME_TEXT "创建桌面快捷方式"
    !define MUI_FINISHPAGE_SHOWREADME_FUNCTION "CreateDesktopShortcutFromFinish"
    !insertmacro MUI_PAGE_FINISH
  !macroend
!endif
