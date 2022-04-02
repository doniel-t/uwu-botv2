import { CommandInterface } from "../utils/CommandInterface";
import DiscordJS from "discord.js";

class Choose extends CommandInterface {
    name: string = "chooose";
    shortcut = 'c';
    description: string = "Choose between different Options";
    options: any = [
        {
            name: "option1",
            description: "Option 1",
            required: true,
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.STRING,
        },
        {
            name: "option2",
            description: "Option 2",
            required: true,
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.STRING,
        },
    ];

    reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): void {
        interaction.reply({
            content: interaction.options.getString("option1") + " or " + interaction.options.getString("option2") + "?\n**" + this.getChoice(interaction) + "**",
        });
    }

    getChoice(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): string {
        return interaction.options.getString(Math.random() > 0.5 ? "option1" : "option2") as string;
    }
}

export function getInstance() {return new Choose()};