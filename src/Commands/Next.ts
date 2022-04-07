import DiscordJS from 'discord.js';
import { musicHandler } from '../index';
import { NormalCommandClass } from '../utils/NormalCommand/NormalCommand';

class Next extends NormalCommandClass {
    name = "next";
    description = "Plays next song in music queue";
    reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): void {
        if (!interaction.guildId) {
            interaction.reply({
                content: "Please join a VoiceChannel"
            });
            return;
        }
        if (musicHandler.skip(interaction.guildId)) {
            interaction.reply({ content: "Next Song Playing" });
        } else {
            interaction.reply({ content: "No more songs in queue" });
        }
    }
}

export function getInstance() { return new Next() };