import DiscordJS, { ApplicationCommandDataResolvable} from 'discord.js';

export interface CommandInterface {
    name: string;
    description: string;

    build() : DiscordJS.ApplicationCommandDataResolvable;
    reply(interaction : DiscordJS.CommandInteraction<DiscordJS.CacheType>) : void;
}