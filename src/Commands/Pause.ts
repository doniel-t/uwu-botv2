import DiscordJS from 'discord.js';
import { musicHandler } from '../index';
import { NormalCommandClass } from '../utils/NormalCommand/NormalCommand';

class Pause extends NormalCommandClass {
    name = "pause";
    description = "Pauses the music";
    reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): void {
        if (!interaction.guildId) {
            interaction.reply({
                content: "Please join a VoiceChannel"
            });
            return;
        }
        musicHandler.pause(interaction.guildId);
        interaction.reply({ content: "Paused" });
    }
}

export function getInstance() { return new Pause() };