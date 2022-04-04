import DiscordJS from 'discord.js';
import { commandManager } from '../index';
import { DevCommandManager } from 'src/utils/DevCommandManager';
import { DevCommandClass } from '../utils/CommandInterface';
import { ApplicationCommandOptionTypes } from 'discord.js/typings/enums';

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