import DiscordJS from 'discord.js';
import { commandManager } from "../index";
import { DevCommandManager } from '../utils/Commands/DevCommandManager';
import { DevCommandClass } from '../utils/Commands/DevCommand/DevCommand';

class ReloadDev extends DevCommandClass {
    name = "reload_dev";
    shortcut = "rd";
    description = "Reloads Command Cache of DevServer";
    reloadable = false;
    reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): void {
        (commandManager as DevCommandManager).reloadDevCommands();
        interaction.reply({ content: "Done" });
    }
}

export function getInstance() { return new ReloadDev() };