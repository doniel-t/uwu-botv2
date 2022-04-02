import DiscordJS, { CacheType, CommandInteraction, ApplicationCommandDataResolvable } from 'discord.js';
import { CommandInterface } from '../utils/CommandInterface';

export class Add implements CommandInterface {
    name = 'add';
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