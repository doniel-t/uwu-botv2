import DiscordJS from 'discord.js';
import { commandManager } from '../index';
import { DevCommandManager } from '../utils/Commands/DevCommandManager';
import { DevCommandClass } from '../utils/Commands/DevCommand/DevCommand';

class DeleteDevCache extends DevCommandClass {
    name = "delete_dev_cache";
    description = "Deletes the dev command cache";
    reloadable = false;
    reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): void {
        (commandManager as DevCommandManager).deleteDevCache();
        interaction.reply({ content: "Cache deleted" });
    }
}

export function getInstance() { return new DeleteDevCache() };