!macro customInstall
  ; Check if config.json exists in the same folder as the installer
  ${If} ${FileExists} "$EXEDIR\config.json"
    ; Copy it to the program installation folder
    CopyFiles "$EXEDIR\config.json" "$INSTDIR\config.json"
  ${EndIf}
!macroend