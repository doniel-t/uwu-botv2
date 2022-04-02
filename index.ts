import DiscordJS, { Intents, Interaction } from 'discord.js';
import dotenv from 'dotenv';
import { CommandInterface } from './src/utils/CommandInterface';
import { CommandManager } from './src/utils/CommandManager';

dotenv.config();

const client = new DiscordJS.Client({
    intents: [
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MESSAGES,
    ]
});

const commandManager : CommandManager = new CommandManager();

client.on('ready', () => {
    console.log('Bot is Ready!');

    const guildId = 'process.env.GUILD_ID';
    const guild = client.guilds.cache.get(guildId);
    let commands = guild ? guild.commands : client.application?.commands;

    commandManager.getAllCommands()?.forEach((command : CommandInterface) => {
        if(command.name == undefined) return;
        if(command.description == undefined) return;
        commands?.create({
            name: command.name,
            description: command.description,
            options: command.options
        });
    });
});


client.on('interactionCreate', async ( interaction : Interaction ) => {

    if(!interaction.isCommand()) return;

    const { commandName } = interaction;

    const command = commandManager.getCommandByName(commandName);
    if (command == undefined){
        interaction.reply('Command not found!');
        return;
    }
    command.reply(interaction);
})

client.login("process.env.TOKEN");
