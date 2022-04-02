import DiscordJS, { CacheType, CommandInteraction } from 'discord.js';
import { CommandInterface } from '../utils/CommandInterface';

class Add extends CommandInterface {
    name = 'add';
    description = 'adds two numbers XD';
    options = [
        {
            name: 'number1',
            description: 'First number to add',
            required: true,
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.NUMBER,
        },
        {
            name: 'number2',
            description: 'Second number to add',
            required: true,
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.NUMBER,
        }
    ]

    reply(interaction: CommandInteraction<CacheType>): void {
        interaction.reply(
            {
                content: this.getContent(interaction)
            });
    }

    //returns the string response from the command
    getContent(interaction: CommandInteraction<CacheType>): string {
        const { options } = interaction;
        const firstNumber : number | null = options.getNumber("number1");
        const secondNumber : number | null = options.getNumber("number2");
        
        return `sum: ${firstNumber! + secondNumber!}`;
    }
}

export function getInstance() {return new Add()};