import DiscordJS, { ApplicationCommandOptionType, ApplicationCommandType } from "discord.js";
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
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                {
                    name: "game",
                    description: "Which game to get the username for",
                    required: true,
                    type: ApplicationCommandOptionType.String,
                },
            ]
        },
        {
            name: "set",
            description: "Sets username for game",
            required: false,
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                {
                    name: "game",
                    description: "Which game to set the username for",
                    required: true,
                    type: ApplicationCommandOptionType.String,
                },
                {
                    name: "name",
                    description: "Which name to set",
                    required: true,
                    type: ApplicationCommandOptionType.String,
                },
            ]
        },
        {
            name: "remove",
            description: "Removes username for game",
            required: false,
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                {
                    name: "game",
                    description: "Which game to remove the username for",
                    required: true,
                    type: ApplicationCommandOptionType.String,
                }
            ]
        },
        {
            name: "get_all_games",
            description: "Returns the list of games",
            required: false,
            type: ApplicationCommandOptionType.Subcommand
        },
    ];
    reply(interaction: DiscordJS.ChatInputCommandInteraction): void {

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

        if (!(Object.values(GameTypes).includes(interaction.options.get("game", true).value as GameTypes))) {
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

function getHandler(interaction: DiscordJS.CommandInteraction) {
    let name = nameHandler.get(interaction.user.id, interaction.guildId as string, interaction.options.get("game")?.value as GameTypes);
    interaction.reply({
        content: name ? `Your name for ${interaction.options.get("game")?.value} is ${name}` : `You don't have a name set for ${interaction.options.get("game")?.value}`,
    });
}

function setHandler(interaction: DiscordJS.CommandInteraction) {
    nameHandler.set(interaction.user.id, interaction.guildId as string, interaction.options.get("game")?.value as GameTypes, interaction.options.get("name")?.value as string);
    interaction.reply({
        content: `Your name for ${interaction.options.get("game")?.value} has been set to ${interaction.options.get("name")?.value}`,
    });
}

function removeHandler(interaction: DiscordJS.CommandInteraction) {
    nameHandler.remove(interaction.user.id, interaction.guildId as string, interaction.options.get("game")?.value as GameTypes);
    interaction.reply({
        content: `Your name for ${interaction.options.get("game")?.value} has been removed`,
    });
}