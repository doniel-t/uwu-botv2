import { DevCommandClass } from "../utils/CommandInterface";
import { commandManager } from "../index";
import DiscordJS from "discord.js";
import { DevCommandManager } from "src/utils/DevCommandManager";

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