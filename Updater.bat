git pull origin master
git submodule update --init --recursive
call npm install
cd dependencies/websocket
call npm install
cd ../vscode_extension
call npm install