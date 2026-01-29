
if (process.argv.includes("ws")) {
    console.log("Starting with WebSocket!");
    require("../dependencies/websocket/index.js");
}

require("./index.ts");