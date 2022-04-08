mkdir secrets
cd secrets
echo GUILD_ID= > .env
echo TOKEN= >> .env
echo CLIENT_ID= >> .env
cd ..
call npm install
git submodule update --init --recursive
cd dependencies/websocket
call .\Installer.bat
cd ../vscode_extension
call npm install