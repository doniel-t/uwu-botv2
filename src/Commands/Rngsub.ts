import DiscordJS, { ApplicationCommandOptionType } from "discord.js";
import { NormalCommandClass } from "../utils/Commands/NormalCommand/NormalCommand";
const snoowrap = require("snoowrap");

let reddit_api: any = undefined;

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
    await interaction.reply({
      content: "Hold on REDDIT's is dogshit",
    });
    const content = await getSubreddit(interaction);
    await interaction.editReply({ content: content }).catch((err: Error) => {
      console.log(err);
    });
  }
}

export function getInstance() {
  return new RngSub();
}

async function getSubreddit(
  interaction: DiscordJS.CommandInteraction
): Promise<string> {
  let post = await getPost(parseOption(interaction));
  console.log(post.permalink);
  return !post.permalink
    ? "Reddit returned undefined (Subreddit disabled random)"
    : "http://reddit.com" + post.permalink;
}

function createAPI() {
  reddit_api = new snoowrap({
    userAgent: process.env.REDDIT_USERAGENT,
    clientId: process.env.REDDIT_CLIENTID,
    clientSecret: process.env.REDDIT_CLIENTSECRET,
    username: process.env.REDDIT_USERNAME,
    password: process.env.REDDIT_PW,
  });
}

function parseOption(interaction: DiscordJS.CommandInteraction): string {
  if (!interaction.options.get("optional_subreddit")) return "Random";
  const parse = String(interaction.options.get("optional_subreddit")?.value);
  return parse;
}

async function getPost(reddit: string): Promise<any> {
  createAPI();
  try {
    let subreddit = await reddit_api.getSubreddit(reddit);
    let randomSub = await subreddit.getRandomSubmission();
    return randomSub;
  } catch (err) {
    return "Command failed";
  }
}
