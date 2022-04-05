import DiscordJS, { Intents, Interaction, Message } from 'discord.js';
import dotenv from 'dotenv';
import { CommandManagerInterface } from './utils/CommandManagerInterface';
import { isAdmin } from './utils/Admin';
import { DevCommandManager } from './utils/DevCommandManager';
import { DefaultCommandManager } from './utils/DefaultCommandManager';
import { EmojiHandler } from './Functions/EmojiHandler';
import { FileHandler } from './utils/FileHandler';
import { GuildSettings, GuildSettingsTypes } from './utils/GuildSettings';
import { NameHandler } from './utils/NameHandler';

dotenv.config({ path: './secrets/.env' });

export const devMode = process.argv.includes("dev");

export const client = new DiscordJS.Client({
    intents: [
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MESSAGES,
    ]
});

export var commandManager: CommandManagerInterface;
export var emojiHandler: EmojiHandler;
export var fileHandler: FileHandler;
export var guildSettingsDict: Map<string, GuildSettings>;
export var nameHandler: NameHandler;

client.on('ready', () => {
    fileHandler = new FileHandler();
    guildSettingsDict = fileHandler.initSettings();
    if (guildSettingsDict.size == 0) {
        console.log("Settings Initialization failed!");
        client.destroy();
        return;
    }
    if (devMode) {
        commandManager = new DevCommandManager();
        console.log("Started in Developer Mode!");
    } else {
        commandManager = new DefaultCommandManager();
    }
    emojiHandler = new EmojiHandler();
    nameHandler = new NameHandler();
    console.log('Bot is Ready!');
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

client.on('messageCreate', async (message: Message) => {
    if (message.guild !== null && guildSettingsDict.get(message.guild.id)?.get(GuildSettingsTypes.EMOJI_DETECTION)) {
        emojiHandler.proccessMessage(message);
    }
});

client.login(process.env.TOKEN);
