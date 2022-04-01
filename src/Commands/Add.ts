import DiscordJS, { CacheType, CommandInteraction, ApplicationCommandDataResolvable } from 'discord.js';
import { CommandInterface } from '../utils/CommandInterface';
const { SlashCommandBuilder : SlashCommandBuilder } = require('discord.js/builders');


class Add implements CommandInterface {
    name = 'add';
    description = 'adds two numbers together';

    getContent(interaction: CommandInteraction<CacheType>): string {
        const interactionArgs = interaction.options;
        const firstNumber : number | null = interactionArgs.getNumber("num1");
        const secondNumber : number | null = interactionArgs.getNumber("num2");
        
        return `sum: ${firstNumber! + secondNumber!}`;
    }

    build(): ApplicationCommandDataResolvable {
        return SlashCommandBuilder
               .setName(this.name)
               .setDescription(this.description)
               .addStringOption( (option : any) => {
                    option.setName('num1');
                    option.setRequired(true);
                    option.setType(DiscordJS.Constants.ApplicationCommandOptionTypes.INTEGER);
                }, (option : any) => {
                    option.setName('num2');
                    option.setRequired(true);
                    option.setType(DiscordJS.Constants.ApplicationCommandOptionTypes.INTEGER);
                })
    }

    reply(interaction: CommandInteraction<CacheType>): void {
        interaction.reply(
            {
                content: this.getContent(interaction)
            });
        throw new Error('Method not implemented.');
    }
    
}