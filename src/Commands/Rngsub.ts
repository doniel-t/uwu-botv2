import DiscordJS, { ApplicationCommandOptionType } from "discord.js";
import { NormalCommandClass } from "../utils/Commands/NormalCommand/NormalCommand";
import { WebSocket, MessageEvent } from "ws";

class RngSub extends NormalCommandClass {
  name: string = "rngsub";
  description: string = "gives a random post from a subreddit";
  options: any = [
    {
      name: "optional_subreddit",
      description:
        "defines the subreddit from which the post is gonna be pulled",
      required: false,
      type: ApplicationCommandOptionType.String,
    },
  ];

  async reply(interaction: DiscordJS.CommandInteraction) {
    let content = getSubreddit(interaction);
    interaction.reply({
      content: content,
    });
  }
}

export function getInstance() {
  return new RngSub();
}

function getSubreddit(interaction: DiscordJS.CommandInteraction): string {
  let ws = new WebSocket("//httpstest", { handshakeTimeout: 5000 }); // connect to server

  ws.onerror = function error() {
    return "connection to the websocket failed";
  };

  ws.onopen = () => {
    ws.send(
      "RedditAPI " +
        (String(interaction.options.get("optional_subreddit")?.value) ||
          "Random")
    );
  };

  ws.onmessage = function incoming(event: MessageEvent) {
    let data = event.data.toString();
    if (data.startsWith("ERROR")) return "an error accured";
    let submission = JSON.parse(data);
    return !submission.permalink
      ? "Reddit returned undefined (Subreddit disabled random)"
      : "http://reddit.com" + submission.permalink;
    ws.close();
  };
  return "ERROR";
}
