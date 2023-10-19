import { CommandInteraction, ApplicationCommandOptionType } from 'discord.js';
import { NormalCommandClass } from '../utils/Commands/NormalCommand/NormalCommand';
import { calcWinAmountAndUpdateUserJSON, getBet, updateBetJSON } from '../utils/Bet/BetHandler';
import { Bet } from './CreateBet';

class EndBet extends NormalCommandClass {
    name = 'end_bet';
    description = 'Ends the currently running Bet and updates the balances of the users! 🎉🎉';
    options = [
        {
            name: "bet_outcome",
            description: "What was the outcome of the Bet?",
            required: true,
            type: ApplicationCommandOptionType.Boolean,
        }
    ];

    reply(interaction: CommandInteraction): void {
        const outcome = interaction.options.get("bet_outcome", true).value as boolean;
        const bet = getBet();
        if(bet === undefined) {
            interaction.reply({
                content: 'There is no Bet running'
            });
            return;
        }
        calcWinAmountAndUpdateUserJSON(outcome, bet);
        updateBetJSON({} as Bet);
        interaction.reply({
            content: 'Bet ended! 🚀\nCheck your balance with /get_balance!'
        });
    }
}

export function getInstance() { return new EndBet() };