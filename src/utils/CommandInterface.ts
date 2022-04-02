import DiscordJS, { ApplicationCommandDataResolvable} from 'discord.js';

export interface CommandInterface {
    name: string;
    shortcut : string;
    description: string;
    options: any;

    reply(interaction : DiscordJS.CommandInteraction<DiscordJS.CacheType>) : void;
}

