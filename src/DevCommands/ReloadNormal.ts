import DiscordJS from "discord.js";
import { commandManager } from "../index";
import { DevCommandManager } from '../utils/Commands/DevCommandManager';
import { DevCommandClass } from '../utils/Commands/DevCommand/DevCommand';

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