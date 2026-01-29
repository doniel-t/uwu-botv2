import { getDeepseekResponse } from "../utils/LLM/deepseek";
import { NormalCommandClass } from "../utils/Commands/NormalCommand/NormalCommand";
import DiscordJS, { ApplicationCommandOptionType } from "discord.js";


class Ask_AI extends NormalCommandClass {
  name: string = "ask_ai";
  shortcut = "ai";
  description: string = "Ask the AI a question";
  options: any = [
    {
      name: "question",
      description: "Question to ask",
      required: true,
      type: ApplicationCommandOptionType.String,
    }
  ];

  async reply(interaction: DiscordJS.CommandInteraction): Promise<void> {
    // Send initial loading message
    await interaction.reply({
      content: "Generating Response..."
    });

    // Get the AI response
    const content = await this.getContent(interaction);

    // Edit the reply with the actual response
    await interaction.editReply({
      content:
        interaction.options.get("question", true).value +
        "\n**" +
        content +
        "**",
    });
  }


  async getContent(interaction: DiscordJS.CommandInteraction): Promise<string> {
    const userId = interaction.user.id;
    const question = interaction.options.get("question", true).value as string;

    const response = await getDeepseekResponse(question, userId);

    return response;
  }
}

export function getInstance() {
  return new Ask_AI();
}
