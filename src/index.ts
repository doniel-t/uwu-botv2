import DiscordJS, { Intents, Interaction } from 'discord.js';
import dotenv from 'dotenv';
import { CommandManager } from './utils/CommandManager';
import { isAdmin } from './utils/Admin';

dotenv.config({ path: './secrets/.env' });

export const client = new DiscordJS.Client({
    intents: [
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MESSAGES,
    ]
});

export var commandManager: CommandManager;

client.on('ready', () => {
    commandManager = new CommandManager();
    console.log('Bot is Ready!');
});

client.on('interactionCreate', async (interaction: Interaction) => {

    if (!interaction.isCommand()) return;

    const command = commandManager.getCommandByName(interaction.commandName);
    if (command == undefined) {
        interaction.reply('Command not found!');
        return;
    }
    if ('isAdmin' in command) {
        if (!isAdmin(interaction.user.id, interaction.guildId)) {
            interaction.reply({
                content: 'You are not an admin!'
            });
            return;
        }
    }
    command.reply(interaction);
})

client.login(process.env.TOKEN);
