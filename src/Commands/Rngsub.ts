import DiscordJS, { ApplicationCommandOptionType } from "discord.js";
import { NormalCommandClass } from "../utils/Commands/NormalCommand/NormalCommand";
import { getPostUrl } from "../utils/reddit/getRandomPost";
const snoowrap = require("snoowrap");
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
      content: "Hold on my hosts' internet is dogshit",
    });
    const content = await getPostUrl(interaction);
    await interaction.editReply({ content: content }).catch((err: Error) => {
      console.log(err);
    });
  }
}

export function getInstance() {
  return new RngSub();
}
