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
import { ReplyAIHandler } from './utils/ReplyAIHandler';
import { getDB } from './utils/LLM/vectorDB/db';
import { backfill, isTrackedUser, TARGET_GUILD_ID } from './utils/LLM/vectorDB/ingest';
import { queueMessage, startQueueProcessor } from './utils/LLM/vectorDB/queue';
import { initPricing } from './utils/LLM/utils/api/openrouter';

dotenv.config({ path: './secrets/.env' });

// Handle unhandled errors from Discord.js voice library
// This catches RangeErrors from malformed UDP packets which are usually harmless
process.on('uncaughtException', (error: Error) => {
  if (error instanceof RangeError && error.message.includes('offset') && error.message.includes('out of range')) {
    // This is the specific error from Discord.js voice receiver - malformed UDP packets
    // These are usually harmless and can be safely ignored
    console.warn(`[VoiceAI] Caught unhandled RangeError from voice receiver (usually harmless): ${error.message}`);
    return;
  }
  // For other uncaught exceptions, log and potentially crash
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason: unknown) => {
  if (reason instanceof RangeError && reason.message.includes('offset') && reason.message.includes('out of range')) {
    console.warn(`[VoiceAI] Caught unhandled rejection from voice receiver (usually harmless): ${reason.message}`);
    return;
  }
  console.error('Unhandled Rejection:', reason);
});

export const devMode = process.argv.includes("dev");

export const client = new DiscordJS.Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ]
});

export var commandManager: CommandManagerInterface;
export var emojiHandler: EmojiHandler;
export var fileHandler: FileHandler;
export var settingsHandler: SettingsHandler;
export var nameHandler: NameHandler;
export var musicHandler: MusicHandler;
export var replyAIHandler: ReplyAIHandler;

client.on('ready', async () => {
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
    replyAIHandler = new ReplyAIHandler();

    // Initialize OpenRouter pricing cache + vector DB
    try {
        await initPricing();
        getDB();
        startQueueProcessor();
        console.log('[VectorDB] Initialized. Starting backfill in background...');
        backfill(client).catch((err) => console.error('[VectorDB] Backfill error:', err));
    } catch (error) {
        console.error('[VectorDB] Initialization error:', error);
    }

    console.log('Bot is Ready!');
});

client.on('interactionCreate', async (interaction: Interaction) => {

    if (!interaction.isCommand()) return;

    console.log(`[InteractionCreate] Command: ${interaction.commandName}, ID: ${interaction.id}, replied: ${interaction.replied}, deferred: ${interaction.deferred}`);

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
        // Only reply if not already replied/deferred
        if (!interaction.replied && !interaction.deferred) {
            interaction.reply({
                content: 'An error occured!'
            });
        }
    }
});

client.on('messageCreate', async (message: Message) => {
    if (message.guild == null) return;
    if (message.author.bot) return;

    // Queue tracked user messages from the target guild for vector DB ingestion
    if (message.guild.id === TARGET_GUILD_ID && isTrackedUser(message.author.id)) {
        queueMessage(message);
    }

    if (settingsHandler.get(message.guild.id, GuildSettingsTypes.EMOJI_DETECTION)?.value) {
        emojiHandler.proccessMessage(message);
    }

    // Check if this is a reply mentioning the bot (ReplyAI feature)
    if (replyAIHandler.shouldHandle(message)) {
        await replyAIHandler.processMessage(message);
        return; // Don't process as a regular command
    }

    let prefix = settingsHandler.get(message.guild.id, GuildSettingsTypes.PREFIX)?.value as string;
    if (message.content.startsWith(prefix)) {
        let command = commandManager.getCommandByName(message.content.slice(prefix.length).split(" ")[0]);
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