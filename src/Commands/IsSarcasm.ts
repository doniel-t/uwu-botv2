import { CommandInteraction, ApplicationCommandOptionType } from "discord.js";
import { NormalCommandClass } from "../utils/Commands/NormalCommand/NormalCommand";
import { DevCommandClass } from "../utils/Commands/DevCommand/DevCommand";

type SarcasmDetectionResponse = {
  prediction: string;
  confidence: string;
};

class IsSarcasm extends NormalCommandClass {
  name = "is_sarcasm";
  description = "Check if the message is sarcastic (only works for English)";
  options = [
    {
      name: "message",
      description: "Message you want to be checked for sarcasm",
      required: true,
      type: ApplicationCommandOptionType.String,
    },
  ];

  async reply(interaction: CommandInteraction): Promise<void> {
    const content = await this.getContent(interaction);
    if (content) {
      interaction.reply({ content });
      return;
    }
    interaction.reply("Sarcasm detection failed or is down 🤭🔫");
  }

  //returns the string response from the command
  async getContent(interaction: CommandInteraction): Promise<string | undefined> {
    const SARCASM_URL = process.env.SARCASM_URL;
    if (!SARCASM_URL) {
      console.log("Sarcasm Detection URL is not set")
      return "Sarcasm Detection URL is not Set - go annoy host";
    }

    try {
      const message = interaction.options.get("message", true).value;
      const sarcasmRequest = await fetch(
        `${SARCASM_URL}:5000/predictSarcasm?textToPredict=${message}`
      );
      const sarcasmResponse: SarcasmDetectionResponse =
        await sarcasmRequest.json();

      console.log(sarcasmResponse);

      const prediction = sarcasmResponse.prediction === "0" ? "Not sarcastic" : "Sarcastic";
      
      if (!sarcasmResponse.prediction || !sarcasmResponse.confidence) {
        return "Sarcasm detection failed or is down 🤭🔫";
      }

      return `${message}\nPrediction: \`${prediction}\`\nConfidence: \`${sarcasmResponse.confidence.substring(0,5)}\``;  
    } catch (error) {
        console.log(error);
        return "Sarcasm detection failed or is down 🤭🔫";
    }
  }
}

export function getInstance() {
  return new IsSarcasm();
}
