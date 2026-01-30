import { getDeepseekResponse } from "../utils/LLM/deepseek";
import { NormalCommandClass } from "../utils/Commands/NormalCommand/NormalCommand";
import DiscordJS, { ApplicationCommandOptionType } from "discord.js";


const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
    const isKind = Math.random() < 0.5;
    const question = interaction.options.get("question", true).value as string;

    // Thinking animation
    await interaction.reply({ content: "Thinking." });
    await sleep(150);
    await interaction.editReply({ content: "Thinking.." });
    await sleep(150);
    await interaction.editReply({ content: "Thinking..." });
    await sleep(200);

    // Mood reveal
    const moodMessage = isKind ? "Im feeling generous" : "get fucked";
    await interaction.editReply({ content: moodMessage });

    // Fetch AI response with mood-aware prompt
    const moodInstruction = isKind
      ? "Be kind and helpful. Reply in one short sentence."
      : "Roast the user brutally. Be savage and funny.";
    const content = await getDeepseekResponse(
      `${moodInstruction}\n\nUser's question: ${question}`,
      interaction.user.id
    );

    await interaction.editReply({
      content: `${question}\n*${moodMessage}*\n**${content}**`,
    });
  }
}

export function getInstance() {
  return new Ask_AI();
}
