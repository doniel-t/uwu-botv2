import DiscordJS from 'discord.js';
import { DevCommandClass } from '../utils/CommandInterface';
import { commandManager } from "../index";
import { DevCommandManager } from 'src/utils/DevCommandManager';

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