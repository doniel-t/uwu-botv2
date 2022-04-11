import DiscordJS from 'discord.js';
import { NormalCommandClass } from '../utils/Commands/NormalCommand/NormalCommand';

class MusicSupport extends NormalCommandClass {
    name = "musicsupport";
    description = "Shows the music sites supported by the bot";
    reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): void {
        interaction.reply({ content: MusicSupport.sites.join("\n") });
    }
    static sites = [
        "Youtube Songs",
        "Youtube Playlists",
        "Soundclound Songs"
    ];
}

export function getInstance() { return new MusicSupport() };