const snoowrap = require("snoowrap");
import DiscordJS, {
  ApplicationCommandOptionType,
  SlashCommandSubcommandGroupBuilder,
} from "discord.js";

export async function getPostUrl(
  interaction: DiscordJS.CommandInteraction
): Promise<string> {
  let post = await getPost(parseOption(interaction));
  return !post.permalink
    ? "Reddit returned undefined"
    : "http://reddit.com" + post.permalink;
}

function createAPI() {
  try {
    return new snoowrap({
      userAgent: process.env.REDDIT_USERAGENT,
      clientId: process.env.REDDIT_CLIENTID,
      clientSecret: process.env.REDDIT_CLIENTSECRET,
      username: process.env.REDDIT_USERNAME,
      password: process.env.REDDIT_PW,
    });
  } catch (err) {
    console.log("invalid or missing credentials (redditAPI)");
    return undefined;
  }
}

function parseOption(interaction: DiscordJS.CommandInteraction): string {
  if (!interaction.options.get("optional_subreddit")) return "Random";
  const parse = String(interaction.options.get("optional_subreddit")?.value);
  return parse;
}

async function getPost(reddit: string): Promise<any> {
  let reddit_api = createAPI();
  try {
    let subreddit = await reddit_api.getSubreddit(reddit);
    let randomSub = await subreddit.getRandomSubmission();
    return randomSub;
  } catch (err) {
    console.log("command failed(getRandomPost)");
    return " ";
  }
}
