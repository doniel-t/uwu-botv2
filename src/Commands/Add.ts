import DiscordJS, { CacheType, CommandInteraction } from 'discord.js';
import { CommandInterface } from '../utils/CommandInterface';

class Add implements CommandInterface {
    name = 'add';
    shortcut = "";
    description = 'adds two numbers XD';
    options = [
        {
            name: 'number1',
            description: 'First Number to add',
            required: true,
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.NUMBER,
        },
        {
            name: 'number2',
            description: 'Second Number to add',
            required: true,
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.NUMBER,
        }
    ]

    //returns the string response from the command
    getContent(interaction: CommandInteraction<CacheType>): string {
        const { options } = interaction;
        const firstNumber : number | null = options.getNumber("number1");
        const secondNumber : number | null = options.getNumber("number2");
        
        return `sum: ${firstNumber! + secondNumber!}`;
    }


    reply(interaction: CommandInteraction<CacheType>): void {
        interaction.reply(
            {
                content: this.getContent(interaction)
            });
    }
}
export const addCommand = new Add();