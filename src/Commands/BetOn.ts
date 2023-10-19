import { CommandInteraction, ApplicationCommandOptionType } from 'discord.js';
import { NormalCommandClass } from '../utils/Commands/NormalCommand/NormalCommand';
import fs from 'fs';
import { didUserAlreadyBet, getBet, hasUserEnoughCurrency, isUserRegistered, updateBetJSON, updateUserCurrency } from '../utils/Bet/BetHandler';

class BetOn extends NormalCommandClass {
    name = 'bet';
    description = 'Bet with your SA on the current Bet!';
    options = [
        {
            name: "amount",
            description: "How much are you betting?",
            required: true,
            type: ApplicationCommandOptionType.Number,
        },
        {
            name: "bet_outcome",
            description: "What is the outcome you are betting on?",
            required: true,
            type: ApplicationCommandOptionType.Boolean,
        }
    ]

    reply(interaction: CommandInteraction): void {
        const bet = getBet();
        if(bet === undefined) {
            interaction.reply({
                content: 'There is no Bet running'
            });
            return;
        }
        const userID = interaction.user.id;
        const isRegistered = isUserRegistered(userID);
        if(!isRegistered) {
            interaction.reply({
                content: 'You are not registered'
            });
            return;
        }

        if(didUserAlreadyBet(userID, bet)) {
            interaction.reply({
                content: 'You already bet on this Bet 🥲'
            });
            return;
        }

        const amount = interaction.options.get("amount", true).value as number;
        const betOutcome = interaction.options.get("bet_outcome", true).value as boolean;
        
        if(!hasUserEnoughCurrency(userID, amount)) {
            interaction.reply({
                content: 'You do not have enough currency'
            });
            return;
        }

        bet.users.push({ userID, amount, betOutcome });
        updateBetJSON(bet);
        updateUserCurrency(userID, amount);
        interaction.reply({
            content: `You bet ${amount}-SA on ${betOutcome ? 'win' : 'lose'}\nYour balance is now ${isUserRegistered(userID)?.balance}`
        });
    }
    
}

export function getInstance() { return new BetOn() };