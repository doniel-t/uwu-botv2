import { ApplicationCommandOptionTypes } from "discord.js/typings/enums";
import { CommandInterface } from "../CommandInterface";
import DiscordJS from 'discord.js';

export abstract class AdminCommandClass implements CommandInterface {
    name: string = "";
    shortcut: string | undefined;
    description: string = "";
    options: {
        name: string;
        description: string;
        required: boolean;
        type: ApplicationCommandOptionTypes;
    }[] | undefined;
    isAdmin = true;
    isDev = false;
    reloadable = true;

    reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>) {
        interaction.reply({
            content: "Not implemented"
        });
    };
}
