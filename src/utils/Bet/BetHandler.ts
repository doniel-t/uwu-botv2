import fs from 'fs';
import { Bet, BetEntry } from '../../Commands/CreateBet';
import { BetUser } from '../../Commands/JoinBet';

const BET_DIR = './data/betting/';
const BET_PATH = `${BET_DIR}currentBet.json`;
const USERS_PATH = `${BET_DIR}registeredUsers.json`;

export function getBet(){
    const isNotEmpty = (obj: Bet | {}): obj is Bet => Object.keys(obj).length !== 0;
    const betJSON = fs.readFileSync(BET_PATH, 'utf-8');
    const currentBet: Bet = JSON.parse(betJSON);
    return isNotEmpty(currentBet) ? currentBet : undefined;
}


export function getRegisteredUsers() {
    const usersJSON = fs.readFileSync(USERS_PATH, 'utf-8');
    const registeredUsers: BetUser[] = JSON.parse(usersJSON);
    return registeredUsers;
}

export function updateRegisteredUsersJSON(users: BetUser[]) {
    fs.writeFileSync(USERS_PATH, JSON.stringify(users));
}

export function updateBetJSON(bet: Bet) {
    fs.writeFileSync(BET_PATH, JSON.stringify(bet));
}

export function isUserRegistered(userID: string) {
    const users = getRegisteredUsers();
    return users.find((user: BetUser) => user.id === userID);
}

export function didUserAlreadyBet(userID: string, bet: Bet) {
    return bet.users.find((entry: BetEntry) => entry.userID === userID);
}

export function hasUserEnoughCurrency(userID: string, amount: number) {
    const users = getRegisteredUsers();
    const user = users.find((user: BetUser) => user.id === userID);
    if(!user) return false;
    return user.balance >= amount;
}

export function updateUserCurrency(userID: string, amount: number){
    const users = getRegisteredUsers();
    const user = users.find((user: BetUser) => user.id === userID);
    if(!user) return;
    user.balance -= amount;
    updateRegisteredUsersJSON(users);
}

export function getBalanceOfUser(userID: string) {
    const users = getRegisteredUsers();
    const user = users.find((user: BetUser) => user.id === userID);
    if(!user) return;
    return user.balance;
}

function getWinners(outcome: boolean, bet: Bet) {
    return bet.users.filter((entry: BetEntry) => outcome === entry.betOutcome);
}

function getTotalBetAmount(Bet: Bet) {
    return Bet.users.reduce((acc: number, entry: BetEntry) => acc + entry.amount, 0);
}


export function calcWinAmountAndUpdateUserJSON(outcome: boolean, bet: Bet){
    const totalPool = getTotalBetAmount(bet);
    const winners = getWinners(outcome, bet);
    const winnerPool = winners.reduce((acc: number, entry: BetEntry) => acc + entry.amount, 0);
    
    const winnerPoints = winners.map((winner: BetEntry) => {
        const percentageWinnerAmount = winner.amount / winnerPool;
        const updatedAmount = totalPool * percentageWinnerAmount

        return {
            userID: winner.userID,
            amount: updatedAmount,
            betOutcome: winner.betOutcome
        }
    });

    // update user balance of each winner
    const users = getRegisteredUsers();
    const updatedUsers = users.map((user: BetUser) => {
        const winner = winnerPoints.find((winner: BetEntry) => winner.userID === user.id);
        if(!winner) return user;
        user.balance += winner.amount;
        return user;
    });

    updateRegisteredUsersJSON(updatedUsers);
}

function defaultIfNaN(value: number, defaultValue: number) {
    return isNaN(value) ? defaultValue : value;
}

export function getBetOdds(bet: Bet) {
    const totalPool = getTotalBetAmount(bet);
    const betters = bet.users;
    const bettersChoseTrue = betters.filter((better: BetEntry) => better.betOutcome);
    const bettersChoseTrueValue = bettersChoseTrue.reduce((acc: number, better: BetEntry) => acc + better.amount, 0);
    const percentageTrue = defaultIfNaN(bettersChoseTrueValue / totalPool, 0);

    return {
        total: totalPool ?? 0,
        trueBetters: {
            betCount: bettersChoseTrue.length ?? 0,
            percentage: defaultIfNaN(percentageTrue * 100, 0).toFixed(2) ?? 0,
            value: bettersChoseTrueValue ?? 0
        },
        falseBetters: {
            betCount: (betters.length - bettersChoseTrue.length) ?? 0,
            percentage: defaultIfNaN((1 - percentageTrue)*100, 0).toFixed(2) ?? 0,
            value: (totalPool - bettersChoseTrueValue) ?? 0
        }
    }
}


