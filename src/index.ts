import DiscordJS, { GatewayIntentBits, Interaction, Message } from 'discord.js';
import dotenv from 'dotenv';

import { CommandManagerInterface } from './utils/Commands/CommandManagerInterface';
import { DevCommandManager } from './utils/Commands/DevCommandManager';
import { DefaultCommandManager } from './utils/Commands/DefaultCommandManager';

import { GuildSettingsTypes } from './utils/Settings/GuildSettings';
import { SettingsHandler } from './utils/Settings/SettingsHandler';

import { isAdmin } from './utils/Admin';
import { EmojiHandler } from './utils/EmojiHandler';
import { FileHandler } from './utils/FileHandler';
import { NameHandler } from './utils/NameHandler';
import { MusicHandler } from './utils/Music/MusicHandler';
import { messageToInteraction } from './utils/MessageToInteraction';

dotenv.config({ path: './secrets/.env' });

export const devMode = process.argv.includes("dev");

export const client = new DiscordJS.Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildVoiceStates
    ]
});

export var commandManager: CommandManagerInterface;
export var emojiHandler: EmojiHandler;
export var fileHandler: FileHandler;
export var settingsHandler: SettingsHandler;
export var nameHandler: NameHandler;
export var musicHandler: MusicHandler;

client.on('ready', () => {
    fileHandler = new FileHandler();
    settingsHandler = new SettingsHandler(fileHandler.initSettings());
    if (settingsHandler.valid) {
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
    musicHandler = new MusicHandler();
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
    try {
        await command.reply(interaction);
    } catch (error) {
        console.log(error);
        interaction.reply({
            content: 'An error occured!'
        });
    }
});

client.on('messageCreate', async (message: Message) => {
    if (message.guild == null) return;

    if (settingsHandler.get(message.guild.id, GuildSettingsTypes.EMOJI_DETECTION)?.value) {
        emojiHandler.proccessMessage(message);
    }

    let prefix = settingsHandler.get(message.guild.id, GuildSettingsTypes.PREFIX)?.value as string;
    if (message.content.startsWith(prefix)) {
        let command = commandManager.getCommandByName(message.content.split(" ")[0].slice(prefix.length));
        if (command) {
            try {
                await command.reply(messageToInteraction(message, command.options?.length));
            } catch (error) {
                console.log(error);
                message.channel?.send({
                    content: 'An error occured!'
                });
            }
        }
    }
});

client.login(process.env.TOKEN);