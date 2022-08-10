import DiscordJS, {ApplicationCommandOptionType} from 'discord.js';

export interface CommandInterface {
    name: string;
    shortcut: string | undefined;
    description: string;
    options: {
        name: string;
        description: string;
        required: boolean;
        type: ApplicationCommandOptionType;
    }[] | undefined;
    isAdmin: boolean;
    isDev: boolean;
    reloadable: boolean;

    reply(interaction: DiscordJS.CommandInteraction): void;
}

