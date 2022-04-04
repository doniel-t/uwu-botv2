import DiscordJS from 'discord.js';
import { client } from '../index';
import { NormalCommandClass } from '../utils/NormalCommand/NormalCommand';

class PrintAllEmojis extends NormalCommandClass {
    name = "print_all_emojis";
    description = "Prints all emojis in the bot";
    reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): void {
        let response = "";
        client.emojis.cache.forEach(emoji => {
            if (response.length >= 1900) {
                interaction.channel?.send(response);
                response = "";
            }
            response += emoji.toString();
        });
        interaction.channel?.send(response.length > 0 ? response : "No emojis found");
        interaction.reply({ content: "Done" });
    }
}

export function getInstance() { return new PrintAllEmojis() };