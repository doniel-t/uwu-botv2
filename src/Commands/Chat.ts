import { CommandInteraction, ApplicationCommandOptionType } from 'discord.js';
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
            type: ApplicationCommandOptionType.String,
        }
    ]

    reply(interaction: CommandInteraction): void {
        this.getContent(interaction, (answer: string) => {
            interaction.reply(
                {
                    content: answer
                });
        });
    }

    //returns the string response from the command
    getContent(interaction: CommandInteraction, callback: Function): void {
        const message = interaction.options.get("message", true).value;

        switch (typeof message) {
            case "string":
                if (message.length > 0) {
                    cleverbot(message).then(ans => {
                        callback(message + "\n**" + ans + "**");
                    }).catch((err) => {
                        console.log(err);
                        callback(message + "\n**I died.**");
                    });
                } else {
                    callback("**I'm not sure what you want me to say.**");
                }
                break;
            default:
                callback("I can't hear you!");
                break;
        }
    }
}

export function getInstance() { return new Chat() };