import DiscordJS from 'discord.js';
import { musicHandler } from '../index';
import { NormalCommandClass } from '../utils/NormalCommand/NormalCommand';

class Resume extends NormalCommandClass {
    name = "resume";
    description = "Resumes the music";
    reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): void {
        if (!interaction.guildId) {
            interaction.reply({
                content: "Please join a VoiceChannel"
            });
            return;
        }
        musicHandler.resume(interaction.guildId);
        interaction.reply({ content: "Resumed" });
    }
}

export function getInstance() { return new Resume() };