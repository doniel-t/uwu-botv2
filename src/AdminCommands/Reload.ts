import { AdminCommandInterface } from "../utils/CommandInterface";
import { commandManager } from "../index";
import DiscordJS from "discord.js";

class Reload extends AdminCommandInterface {
    name = "reload";
    description = "Reload all commands";
    isAdmin = true;

    reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): void {
        commandManager.reloadCommands();
        interaction.reply({
            content: "Done",
        });
    }
}

export function getInstance() {return new Reload()};