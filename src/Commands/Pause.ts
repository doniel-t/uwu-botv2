import DiscordJS from 'discord.js';
import { musicHandler } from '../index';
import { NormalCommandClass } from '../utils/Commands/NormalCommand/NormalCommand';

class Pause extends NormalCommandClass {
    name = "pause";
    description = "Pauses the music";
    reply(interaction: DiscordJS.CommandInteraction): void {
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