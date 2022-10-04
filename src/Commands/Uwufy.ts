import DiscordJS, { ApplicationCommandOptionType } from "discord.js";
import { NormalCommandClass } from "../utils/Commands/NormalCommand/NormalCommand";

class Uwufy extends NormalCommandClass {
  name: string = "uwufy";
  description: string = "takes the input string and makes it better";
  options: any = [
    {
      name: "input_msg",
      description: "msg_to_uwufy",
      required: true,
      type: ApplicationCommandOptionType.String,
    },
  ];
  reply(interaction: DiscordJS.CommandInteraction) {
    let content = uwufying(interaction);
    interaction.reply({
      content: content,
    });
  }
}

function uwufying(interaction: DiscordJS.CommandInteraction): string {
  let input: string = String(interaction.options.get("input_msg")?.value);
  return input.replace(/L|R|V/g, "W").replace(/l|r|v/g, "w");
}

export function getInstance() {
  return new Uwufy();
}
