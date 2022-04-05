import { NormalCommandClass } from "../utils/NormalCommand/NormalCommand";
import DiscordJS from "discord.js";

class Choose extends NormalCommandClass {
    name: string = "choose";
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
        {
            name: "option3",
            description: "Option 3",
            required: false,
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.STRING,
        },
        {
            name: "option4",
            description: "Option 4",
            required: false,
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.STRING,
        },
        {
            name: "option5",
            description: "Option 5",
            required: false,
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.STRING,
        },
        {
            name: "option6",
            description: "Option 6",
            required: false,
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.STRING,
        },
        {
            name: "option7",
            description: "Option 7",
            required: false,
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.STRING,
        },
        {
            name: "option8",
            description: "Option8",
            required: false,
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.STRING,
        },
        {
            name: "option9",
            description: "Option 9",
            required: false,
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.STRING,
        },
        {
            name: "option10",
            description: "Option 10",
            required: false,
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.STRING,
        },
    ];

    reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): void {
        interaction.reply({
            content: this.getString(interaction),
        });
    }

    getString(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): string {
        let options = [];
        for (let i = 0; i < options.length; i++) {
            let option = interaction.options.getString("option" + (i + 1));
            if (option) {
                options.push(option);
            }
        }
        return options.join(" or ") + "?\n**" + options[Math.floor(Math.random() * options.length)] + "**";
    }
}

export function getInstance() { return new Choose() };