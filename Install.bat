mkdir secrets
cd secrets
"GUILD_ID=\nTOKEN=\nCLIENT_ID=" > .env
cd ..
call npm install
cd dependencies/websocket
call npm install
cd ../vscode_extension
call npm install