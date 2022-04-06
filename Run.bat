Rem Starting uwu-botv2 and websocket
start cmd /c "cd dependencies/websocket & start cmd /k run.bat"
timeout /t 3
start cmd /k "RunNoWebsocket.bat"