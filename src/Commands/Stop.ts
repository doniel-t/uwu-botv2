import DiscordJS from 'discord.js';
import { musicHandler } from '../index';
import { NormalCommandClass } from '../utils/Commands/NormalCommand/NormalCommand';

class Stop extends NormalCommandClass {
    name = "stop";
    description = "Stops music";
    reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): void {
        if (!interaction.guildId) {
            interaction.reply({
                content: "Please join a VoiceChannel"
            });
            return;
        }
        musicHandler.stop(interaction.guildId);
        interaction.reply({ content: "Stopped" });
    }
}

export function getInstance() { return new Stop() };