import { NormalCommandClass } from '../utils/Commands/NormalCommand/NormalCommand';
import DiscordJS, { ApplicationCommandOptionType } from "discord.js";

class Choose extends NormalCommandClass {
    name: string = "choose";
    shortcut = 'c';
    description: string = "Choose between different Options";
    options: any = [
        {
            name: "option1",
            description: "Option 1",
            required: true,
            type: ApplicationCommandOptionType.String,
        },
        {
            name: "option2",
            description: "Option 2",
            required: true,
            type: ApplicationCommandOptionType.String,
        },
        {
            name: "option3",
            description: "Option 3",
            required: false,
            type: ApplicationCommandOptionType.String,
        },
        {
            name: "option4",
            description: "Option 4",
            required: false,
            type: ApplicationCommandOptionType.String,
        },
        {
            name: "option5",
            description: "Option 5",
            required: false,
            type: ApplicationCommandOptionType.String,
        },
        {
            name: "option6",
            description: "Option 6",
            required: false,
            type: ApplicationCommandOptionType.String,
        },
        {
            name: "option7",
            description: "Option 7",
            required: false,
            type: ApplicationCommandOptionType.String,
        },
        {
            name: "option8",
            description: "Option 8",
            required: false,
            type: ApplicationCommandOptionType.String,
        },
        {
            name: "option9",
            description: "Option 9",
            required: false,
            type: ApplicationCommandOptionType.String,
        },
        {
            name: "option10",
            description: "Option 10",
            required: false,
            type: ApplicationCommandOptionType.String,
        },
    ];

    reply(interaction: DiscordJS.CommandInteraction): void {
        interaction.reply({
            content: this.getString(interaction),
        });
    }

    getString(interaction: DiscordJS.CommandInteraction): string {
        let optionArray = [];
        for (let i = 0; i < this.options.length; i++) {
            let option = interaction.options.get("option" + (i + 1))?.value;
            if (option) {
                optionArray.push(option);
            }
        }
        return optionArray.join(" or ") + "?\n**" + optionArray[Math.floor(Math.random() * optionArray.length)] + "**";
    }
}

export function getInstance() { return new Choose() };