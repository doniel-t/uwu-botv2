import { CacheType, CommandInteraction } from 'discord.js';
import { DevCommandManager } from '../utils/Commands/DevCommandManager';
import { commandManager } from '../index';
import { DevCommandClass } from '../utils/Commands/DevCommand/DevCommand';

class DeleteCachedCommands extends DevCommandClass {
    name = 'delete_all_cached_commands';
    description = 'deletes all cached commands and reloads them';
    options = []
    reloadable = false;
    reply(interaction: CommandInteraction<CacheType>): void {
        (commandManager as DevCommandManager).deleteCachedCommands();
        commandManager.loadCommands();

        interaction.reply({
            content: this.getContent(interaction)
        });
    }

    //returns the string response from the command
    getContent(interaction: CommandInteraction<CacheType>): string {
        return "Cleared all globally cached commands and reloaded them\nThis may take up to an hour";
    }
}

export function getInstance() { return new DeleteCachedCommands() };