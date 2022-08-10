import DiscordJS, {OAuth2Scopes} from 'discord.js';
import { client } from '../index';
import { NormalCommandClass } from '../utils/Commands/NormalCommand/NormalCommand';

class Invite extends NormalCommandClass {
    name = "invite";
    description = "Creates an invite link for the bot";
    reply(interaction: DiscordJS.CommandInteraction): void {
        interaction.reply({ content: client.generateInvite({scopes:[OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands]}) });
    }
}

export function getInstance() { return new Invite() };