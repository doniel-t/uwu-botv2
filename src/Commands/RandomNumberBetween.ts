import DiscordJS, { ApplicationCommandOptionType } from "discord.js";
import { NormalCommandClass } from "../utils/Commands/NormalCommand/NormalCommand";

class RandomNumberBetween extends NormalCommandClass {
  name = "random_number_between";
  shortcut: string = "rng";
  description: string = "Generates a random number between two numbers";
  options = [
    {
      name: "lower_bound",
      description: "Lower bound of the range",
      required: true,
      type: ApplicationCommandOptionType.Number,
    },
    {
      name: "upper_bound",
      description: "Upper bound of the range",
      required: true,
      type: ApplicationCommandOptionType.Number,
    },
  ];

  getContent(interaction: DiscordJS.CommandInteraction) {
    let lowerBound = interaction.options.get("lower_bound", true)
      .value as number;
    let upperBound = interaction.options.get("upper_bound", true)
      .value as number;
    return this.getRandomNumberBetween(
      Math.min(lowerBound, upperBound),
      Math.max(lowerBound, upperBound)
    ).toString();
  }

  getRandomNumberBetween(lowerBound: number, upperBound: number): number {
    return (
      Math.floor(Math.random() * (upperBound - lowerBound + 1)) + lowerBound
    );
  }

  reply(interaction: DiscordJS.CommandInteraction): void {
    interaction.reply({ content: this.getContent(interaction) });
  }
}

export function getInstance() {
  return new RandomNumberBetween();
}
