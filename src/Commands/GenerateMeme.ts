import { CommandInteraction, ApplicationCommandOptionType } from 'discord.js';
import { NormalCommandClass } from '../utils/Commands/NormalCommand/NormalCommand';
import { createMeme } from 'src/utils/MemeGen/MemeGen2';

class GenerateMeme extends NormalCommandClass {
    name = 'generate_meme';
    description = 'Talk to the bot';
    options = [
        {
            name: 'image_url',
            description: 'URL of the image you want to use',
            required: true,
            type: ApplicationCommandOptionType.String,
        },
        {
            name: 'top_text',
            description: 'Top text of the meme you want to make',
            required: true,
            type: ApplicationCommandOptionType.String,
        },
        {
            name: 'bottom_text',
            description: 'Bottom text of the meme you want to make',
            required: true,
            type: ApplicationCommandOptionType.String,
        }
    ]

    async reply(interaction: CommandInteraction): Promise<void> {
        const imageURL = interaction.options.get("image_url", true).value as string;
        const topText = interaction.options.get("top_text", true).value as string;
        const bottomText = interaction.options.get("bottom_text", true).value as string;
        if(topText.length > 100 || bottomText.length > 100) {
            interaction.reply("Text too long - max 100 characters! ⚠️");
            return
        }

        const image = await createMeme(imageURL, topText, bottomText);
        interaction.reply({ files: [image] });
    }
}

export function getInstance() { return new GenerateMeme() };