import { CommandInteraction, ApplicationCommandOptionType } from 'discord.js';
import { NormalCommandClass } from '../utils/Commands/NormalCommand/NormalCommand';
import { getBet, getBetOdds } from '../utils/Bet/BetHandler';

class BettingOdds extends NormalCommandClass {
    name = 'betting_odds';
    description = 'Get stats about the already commited bets!';

    reply(interaction: CommandInteraction): void {
        
        const bet = getBet();
        if(bet === undefined) {
            interaction.reply({
                content: 'There is no Bet running'
            });
            return;
        }
        
        const { total, trueBetters, falseBetters } = getBetOdds(bet);

        interaction.reply({
            content: `### Pool is **${total}-SA** \n**${trueBetters.betCount}** bet on \`yes\`  |  **${falseBetters.betCount}** bet on \`no\`\n\`yes\` Pool is **${trueBetters.value}-SA** (${trueBetters.percentage}%)  |  \`no\` Pool is **${falseBetters.value}-SA** (${falseBetters.percentage}%)\n`
        });
    }
}

export function getInstance() { return new BettingOdds() };