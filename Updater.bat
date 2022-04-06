git pull origin master
git submodules update --init --recursive
call npm install
cd dependencies/websocket
call npm install
cd ../vscode_extension
call npm install