import DiscordJS from 'discord.js';
import { ApplicationCommandOptionTypes } from 'discord.js/typings/enums';

export abstract class CommandInterface {

    name: string = "";
    shortcut: string | undefined;
    description: string = "";
    options: {
        name: string;
        description: string;
        required: boolean;
        type: ApplicationCommandOptionTypes;
    }[] = [];

    reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>) {
        interaction.reply({
            content: "Not implemented"
        });
    };

    toJSON() {
        return {
            name: this.name,
            description: this.description,
            options: this.options,
            default_permission: undefined
        };
    };
}

export abstract class AdminCommandInterface extends CommandInterface {
    isAdmin: boolean = true;
}