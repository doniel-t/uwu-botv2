import DiscordJS from 'discord.js';
import { DevCommandClass } from '../utils/Commands/DevCommand/DevCommand';

class Version extends DevCommandClass {
    name = "version";
    shortcut = "v";
    description = "Replies with the current version of the bot";
    reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): void {
        interaction.reply({ content: require("../../package.json").version });
    }
}

export function getInstance() { return new Version() };