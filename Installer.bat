mkdir secrets
cd secrets
echo GUILD_ID=\nTOKEN=\nCLIENT_ID= > .env
cd ..
call npm install
cd dependencies/websocket
start Installer.bat
cd ../vscode_extension
call npm install