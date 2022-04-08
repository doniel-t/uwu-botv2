import DiscordJS from 'discord.js';
import { client } from '../index';
import { NormalCommandClass } from '../utils/Commands/NormalCommand/NormalCommand';

class Invite extends NormalCommandClass {
    name = "invite";
    description = "Creates an invite link for the bot";
    reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): void {
        interaction.reply({ content: client.generateInvite({scopes:["applications.commands","bot"]}) });
    }
}

export function getInstance() { return new Invite() };