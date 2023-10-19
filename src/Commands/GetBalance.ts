import { CommandInteraction, ApplicationCommandOptionType } from 'discord.js';
import { NormalCommandClass } from '../utils/Commands/NormalCommand/NormalCommand';
import { getBalanceOfUser, isUserRegistered } from '../utils/Bet/BetHandler';

class GetBalance extends NormalCommandClass {
    name = 'get_balance';
    description = 'Gets the current balance of the user';

    reply(interaction: CommandInteraction): void {
        const userID = interaction.user.id;
        const isRegistered = isUserRegistered(userID);
        if(!isRegistered) {
            interaction.reply({
                content: 'You are not registered'
            });
            return;
        }
        const balance = getBalanceOfUser(userID);
        interaction.reply({
            content: `Your current balance is ${balance?.toFixed(2)}-SA 👍`
        });
    }
}

export function getInstance() { return new GetBalance() };