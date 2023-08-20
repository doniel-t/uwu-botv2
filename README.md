# uwu-botv2
The second Version of [uwuBot](https://github.com/danieltheil/uwuBot).

## Installing the Bot
1. Clone the Repository
2. Install NodeJS
3. Run the Installer.bat, it will install all npm modules needed in all dependencies
4. Add the missing Values to secrets/.env
    - GUILD_ID is your Dev Server ID
    - TOKEN is the Bot Token from the [Discord Dev Portal](https://discord.com/developers/applications)
    - CLIENT_ID is the ClientID/ApplicationID of the Bot created in the [Discord Dev Portal](https://discord.com/developers/applications)
5. Add the missing Values to Files in dependencies/websocket/dependencies
    - RiotAPIKey from [Riot Dev Portal](https://developer.riotgames.com/) 
    - osuAPIKey from an OAuth Client in [osu API v2](https://osu.ppy.sh/home/account/edit)
    - RedditAPI from [Reddit API](https://www.reddit.com/dev/api/)
    - TwitchID from [Twitch API](https://dev.twitch.tv/docs/api/)

## Updating the Bot
Run the Updater.bat

## Running the Bot
Start the Bot with Run.bat or RunNoWebsocket.bat if you don't want/need the WebSocket

## Developing
1. Install the VSCode Extension
2. Run `npm run dev` or `npm run dev-ws` to start the Bot
3. To create a Command run `uwuBot: Create Developer Command Template`
4. To make the Command accessible to non-dev Servers run `uwuBot: Convert Developer Command to Normal Command` or `uwuBot: Convert Developer Command to Normal Command`
- The `uwuBot Commands` are accessible by pressing Ctrl+Shift+P after the Extension is installed