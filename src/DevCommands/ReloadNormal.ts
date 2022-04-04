import DiscordJS from "discord.js";
import { commandManager } from "../index";
import { DevCommandManager } from "../utils/DevCommandManager";
import { DevCommandClass } from "../utils/DevCommand/DevCommand";

class ReloadNormal extends DevCommandClass {
    name = "reload_normal";
    description = "Reload all non-dev commands";
    reloadable = false;
    reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): void {
        (commandManager as DevCommandManager).reloadCommands();
        interaction.reply({
            content: "Done",
        });
    }
}

export function getInstance() {return new ReloadNormal()};