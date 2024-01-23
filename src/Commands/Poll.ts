import {
  CommandInteraction,
  APIEmbedField,
  Message,
  Collection,
  MessageReaction,
  EmbedBuilder
} from "discord.js";
import { NormalCommandClass } from "../utils/Commands/NormalCommand/NormalCommand";
import {
  commandOptions,
  getFilteredOptions,
  reactionEmojis,
} from "../utils/Poll/options";



class Poll extends NormalCommandClass {
  name = "poll";
  description = "Make a poll";
  options = commandOptions;

  
  getContent(interaction: CommandInteraction) {
    const filteredOptions = getFilteredOptions(interaction);
    const embed = this.buildEmbed(interaction, filteredOptions);
    return embed;
  }


  async reply(interaction: CommandInteraction) {
    const filteredOptions = getFilteredOptions(interaction);
    const embed = this.getContent(interaction);

    const sentInteraction = await interaction.reply({
      embeds: [embed],
      fetchReply: true,
    });

    filteredOptions.forEach(async (_, i) => {
      const emoji = reactionEmojis[`${i + 1}`];
      if (!emoji) {
        console.log(`Could not find emoji ${emoji}`);
        return;
      }
      await sentInteraction.react(emoji);
    });

    const timeoutInMinutes =
      (interaction.options.get("duration", true).value as number) * 60 * 1000;

    setTimeout(async () => {
      await this.endPoll(sentInteraction);
    }, timeoutInMinutes);
  }

  //return the emoji with the most reactions
  //in case of a tie, return the first one
  getWinner(reactionCache: Collection<string, MessageReaction>) {
    let largestReactionCount = { count: 0, emoji: "" };

    try {
      Object.entries(reactionEmojis).forEach(([key, emoji]) => {
        const reaction = reactionCache.get(emoji);
        if (reaction && reaction.count > largestReactionCount.count) {
          largestReactionCount = { count: reaction.count, emoji };
        }
      });
    } catch (error) {
      console.log(
        "Something went wrong when getting the winner of the poll in /Commands/Poll.ts"
      );
      console.log(error);
      return { count: 0, emoji: "" };
    }

    return largestReactionCount;
  }


  async endPoll(sentInteraction: Message<boolean>) {
    try {
      const message = await sentInteraction.fetch();
      const reactions = message.reactions.cache;
      const firstWinner = this.getWinner(reactions);

      message.reply(`**Poll ended** - Winner is: ${firstWinner.emoji}`);
    } catch (error) {
      console.log(error);
      const message = await sentInteraction.fetch();
      message.reply("Something went wrong when ending the poll 🫠");
    }
  }


  buildEmbed(
    interaction: CommandInteraction,
    options: (string | number | boolean | undefined)[]
  ): EmbedBuilder {
    const currentTime = new Date();
    const durationInMinutes = interaction.options.get("duration", true).value;
    const endTime = new Date(
      currentTime.getTime() + (durationInMinutes as number) * 60 * 1000
    );

    const description = interaction.options.get("description", true).value;

    const embed = new EmbedBuilder()
      .setColor("#ff78c8")
      .setTitle("**Poll**")
      .setAuthor({
        name: interaction.user.username,
        iconURL: interaction.user.avatarURL() as string,
      })
      .setDescription(
        `**### ${description}**\nReact with the corresponding **emoji** to vote\n The poll started at ${currentTime.toLocaleString()}\n\n This poll will end in **${durationInMinutes} minutes** at ${endTime.toLocaleString()}\n\n`
      );

    const embedFields: APIEmbedField[] = [];
    options.forEach((option, i) => {
      embedFields.push({
        name: `Vote for: **${option}**`,
        value: `React with: ${reactionEmojis[`${i + 1}`]}`,
        inline: false,
      });
    });

    embed.addFields(embedFields);
    return embed;
  }
}

export function getInstance() {
  return new Poll();
}
