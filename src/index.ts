import DiscordJS, { Intents, Interaction } from 'discord.js';
import dotenv from 'dotenv';
import { CommandManagerInterface } from './utils/CommandManagerInterface';
import { isAdmin } from './utils/Admin';
import { DevCommandManager } from './utils/DevCommandManager';
import { DefaultCommandManager } from './utils/DefaultCommandManager';

dotenv.config({ path: './secrets/.env' });

export const devMode = process.argv.includes("dev");

export const client = new DiscordJS.Client({
    intents: [
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MESSAGES,
    ]
});

export var commandManager: CommandManagerInterface;

client.on('ready', () => {
    if (devMode) {
        commandManager = new DevCommandManager();
        console.log("Started in Developer Mode!");
    } else {
        commandManager = new DefaultCommandManager();
        console.log('Bot is Ready!');
    }
});

client.on('interactionCreate', async (interaction: Interaction) => {

    if (!interaction.isCommand()) return;

    const command = commandManager.getCommandByName(interaction.commandName);
    if (command == undefined) {
        interaction.reply('Command not found!');
        return;
    }
    if (command.isAdmin) {
        if (!isAdmin(interaction)) {
            interaction.reply({
                content: 'You are not an admin!'
            });
            return;
        }
    }
    command.reply(interaction);
});

client.login(process.env.TOKEN);
