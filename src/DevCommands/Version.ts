import DiscordJS from 'discord.js';
import { NormalCommandClass } from '../utils/NormalCommand/NormalCommand';

class Version extends NormalCommandClass {
    name = "version";
    shortcut = "v";
    description = "Replies with the current version of the bot";
    reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): void {
        interaction.reply({ content: require("../../package.json").version });
    }
}

export function getInstance() { return new Version() };