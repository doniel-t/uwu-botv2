import DiscordJS from 'discord.js';
import { ApplicationCommandOptionTypes } from 'discord.js/typings/enums';

export interface CommandInterface {
    name: string;
    shortcut: string | undefined;
    description: string;
    options: {
        name: string;
        description: string;
        required: boolean;
        type: ApplicationCommandOptionTypes;
    }[] | undefined;
    isAdmin: boolean;
    isDev: boolean;
    reloadable: boolean;

    reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): void;
}

export abstract class NormalCommandClass implements CommandInterface {
    name: string = "";
    shortcut: string | undefined;
    description: string = "";
    options: {
        name: string;
        description: string;
        required: boolean;
        type: ApplicationCommandOptionTypes;
    }[] | undefined;
    isAdmin = false;
    isDev = false;
    reloadable = true;

    reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>) {
        interaction.reply({
            content: "Not implemented"
        });
    };
}

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

export abstract class DevCommandClass implements CommandInterface {
    name: string = "";
    shortcut: string | undefined;
    description: string = "";
    options: {
        name: string;
        description: string;
        required: boolean;
        type: ApplicationCommandOptionTypes;
    }[] | undefined;
    isAdmin = false;
    isDev = true;
    reloadable = true;

    reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>) {
        interaction.reply({
            content: "Not implemented"
        });
    };
}