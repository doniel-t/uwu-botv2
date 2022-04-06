import DiscordJS from 'discord.js';
import { ApplicationCommandOptionTypes } from 'discord.js/typings/enums';
import { NormalCommandClass } from '../utils/NormalCommand/NormalCommand';

class RandomNumberBetween extends NormalCommandClass {
    name = "random_number_between";
    shortcut: string  = 'rng';
    description: string = 'Generates a random number between two numbers';
    options = [
        {
            name: "lower_bound",
            description: "Lower bound of the range",
            required: true,
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.NUMBER,
        },
        {
            name: "upper_bound",
            description: "Upper bound of the range",
            required: true,
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.NUMBER,
        }
    ];

    getContent(interaction : DiscordJS.CommandInteraction<DiscordJS.CacheType>){
        let lowerBound = interaction.options.getNumber("lower_bound") as number;
        let upperBound = interaction.options.getNumber("upper_bound") as number;
        return this.getRandomNumberBetween(Math.min(lowerBound, upperBound), Math.max(lowerBound, upperBound)).toString();
    }

    getRandomNumberBetween(lowerBound: number, upperBound: number): number {
        return Math.floor(Math.random() * (upperBound - lowerBound + 1)) + lowerBound;
    }

    reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): void {
        interaction.reply({ content: this.getContent(interaction) });
    }
}

export function getInstance() { return new RandomNumberBetween() };