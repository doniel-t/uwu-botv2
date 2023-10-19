import { CommandInteraction, ApplicationCommandOptionType } from 'discord.js';
import { NormalCommandClass } from '../utils/Commands/NormalCommand/NormalCommand';
import { v4 as uuidv4 } from 'uuid';
import { getBet, updateBetJSON } from '../utils/Bet/BetHandler';

export type Bet = {
    name: string,
    id: string,
    users: BetEntry[]
}

export type BetEntry = {
    userID: string
    amount: number
    betOutcome: boolean
}

class CreateBet extends NormalCommandClass {
    name = 'create_bet';
    description = 'Creates a Bet where registered Users can bet on';
    options = [
        {
            name: "bet_name",
            description: "What is the Bet about?",
            required: true,
            type: ApplicationCommandOptionType.String,
        }
    ]

    reply(interaction: CommandInteraction): void {

        const currentBet = getBet();

        if(currentBet != undefined) {
            interaction.reply({
                content: `There is already a Bet running: ${currentBet.name}`
            });
            return;
        }

        const betName = interaction.options.get("bet_name", true).value as string;
        const bet: Bet = {
            name: betName,
            id: uuidv4(),
            users: []
        };

        updateBetJSON(bet);

        interaction.reply({
            content: `Created Bet "${betName}"`
        });

    }
    
}

export function getInstance() { return new CreateBet() };