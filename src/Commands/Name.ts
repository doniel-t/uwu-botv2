import DiscordJS from 'discord.js';
import { nameHandler } from '../index';
import { NormalCommandClass } from '../utils/Commands/NormalCommand/NormalCommand';
import { GameTypes } from '../utils/NameHandler';

class Name extends NormalCommandClass {
    name = "name";
    description = "Saves usernames for other Commands";
    options = [
        {
            name: "get",
            description: "Gets username for game",
            required: false,
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
            options: [
                {
                    name: "game",
                    description: "Which game to get the username for",
                    required: true,
                    type: DiscordJS.Constants.ApplicationCommandOptionTypes.STRING,
                },
            ]
        },
        {
            name: "set",
            description: "Sets username for game",
            required: false,
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
            options: [
                {
                    name: "game",
                    description: "Which game to set the username for",
                    required: true,
                    type: DiscordJS.Constants.ApplicationCommandOptionTypes.STRING,
                },
                {
                    name: "name",
                    description: "Which name to set",
                    required: true,
                    type: DiscordJS.Constants.ApplicationCommandOptionTypes.STRING,
                },
            ]
        },
        {
            name: "remove",
            description: "Removes username for game",
            required: false,
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
            options: [
                {
                    name: "game",
                    description: "Which game to remove the username for",
                    required: true,
                    type: DiscordJS.Constants.ApplicationCommandOptionTypes.STRING,
                }
            ]
        },
        {
            name: "get_all_games",
            description: "Returns the list of games",
            required: false,
            type: DiscordJS.Constants.ApplicationCommandOptionTypes.SUB_COMMAND
        },
    ];
    reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): void {

        if (interaction.options.getSubcommand() === "get_all_games") {
            interaction.reply({ content: Object.keys(GameTypes).join(", ").toLowerCase() });
            return;
        }

        if (interaction.guildId == null) {
            interaction.reply({
                content: "This command can only be used in a server.",
            });
            return;
        }

        if (!(Object.values(GameTypes).includes(interaction.options.getString("game") as GameTypes))) {
            interaction.reply({
                content: "Invalid game",
            });
            return;
        }
        switch (interaction.options.getSubcommand()) {
            case "get":
                getHandler(interaction);
                break;
            case "set":
                setHandler(interaction);
                break;
            case "remove":
                removeHandler(interaction);
                break;
            default:
                interaction.reply({
                    content: "Invalid subcommand",
                });
        }
    }
}

export function getInstance() { return new Name() };

function getHandler(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>) {
    let name = nameHandler.get(interaction.user.id, interaction.guildId as string, interaction.options.getString("game") as GameTypes);
    interaction.reply({
        content: name ? `Your name for ${interaction.options.getString("game")} is ${name}` : `You don't have a name set for ${interaction.options.getString("game")}`,
    });
}

function setHandler(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>) {
    nameHandler.set(interaction.user.id, interaction.guildId as string, interaction.options.getString("game") as GameTypes, interaction.options.getString("name") as string);
    interaction.reply({
        content: `Your name for ${interaction.options.getString("game")} has been set to ${interaction.options.getString("name")}`,
    });
}

function removeHandler(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>) {
    nameHandler.remove(interaction.user.id, interaction.guildId as string, interaction.options.getString("game") as GameTypes);
    interaction.reply({
        content: `Your name for ${interaction.options.getString("game")} has been removed`,
    });
}