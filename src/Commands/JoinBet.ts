import { CommandInteraction, ApplicationCommandOptionType } from 'discord.js';
import { NormalCommandClass } from '../utils/Commands/NormalCommand/NormalCommand';
import fs from 'fs';

export type BetUser = {
    id: string,
    balance: number
}

class RegisterBetting extends NormalCommandClass {
    name = 'register_betting';
    description = 'creates a user with a balance of 1000-SA (Suffering Adcs)';

    reply(interaction: CommandInteraction): void {
        const JSON_PATH = './data/betting/registeredUsers.json';

        const userID = interaction.user.id;
        const userBalance = 1000;

        const usersJSON = fs.readFileSync(JSON_PATH, 'utf-8');
        const registeredUsers: BetUser[] = JSON.parse(usersJSON);

        const userExists = registeredUsers.find((user: BetUser) => user.id === userID);

        if(userExists) {
            interaction.reply({
                content: 'You are already registered 🤔 (Sergej fuck off)'
            });
            return;
        }

        const user: BetUser = {
            id: userID,
            balance: userBalance
        };

        registeredUsers.push(user);
        
        fs.writeFileSync(JSON_PATH, JSON.stringify(registeredUsers));

        interaction.reply({
            content: 'You have been registered - have fun betting!🎉'
        });
    }
    
}

export function getInstance() { return new RegisterBetting() };