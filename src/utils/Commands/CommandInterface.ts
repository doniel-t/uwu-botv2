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

