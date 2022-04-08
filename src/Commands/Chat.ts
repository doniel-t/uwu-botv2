import DiscordJS, { CacheType, CommandInteraction } from 'discord.js';
import { NormalCommandClass } from '../utils/Commands/NormalCommand/NormalCommand';
import cleverbot from 'cleverbot-free';

class Chat extends NormalCommandClass {
    name = 'chat';
    description = 'Talk to the bot';
    options = [
        {
            name: 'message',
            description: 'Your message',
            required: true,
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.STRING,
        }
    ]

    reply(interaction: CommandInteraction<CacheType>): void {
        this.getContent(interaction, (answer: string) => {
            interaction.reply(
                {
                    content: answer
                });
        });
    }

    //returns the string response from the command
    getContent(interaction: CommandInteraction<CacheType>, callback: Function): void {
        const message: string | null = interaction.options.getString("message");

        switch (message) {
            case "":
            case undefined:
            case null:
                callback("I can't hear you!");
                break;
            default:
                cleverbot(message).then(ans => {
                    callback(message + "\n**" + ans + "**");
                });
        }
    }
}

export function getInstance() { return new Chat() };