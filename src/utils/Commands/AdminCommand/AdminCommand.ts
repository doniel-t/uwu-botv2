import { CommandInterface } from "../CommandInterface";
import DiscordJS, {ApplicationCommandOptionType} from 'discord.js';

export abstract class AdminCommandClass implements CommandInterface {
    name: string = "";
    shortcut: string | undefined;
    description: string = "";
    options: {
        name: string;
        description: string;
        required: boolean;
        type: ApplicationCommandOptionType;
    }[] | undefined;
    isAdmin = true;
    isDev = false;
    reloadable = true;

    reply(interaction: DiscordJS.CommandInteraction) {
        interaction.reply({
            content: "Not implemented"
        });
    };
}
