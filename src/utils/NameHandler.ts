import { fileHandler } from "../index";
import { FileTypes } from "./FileHandler";

export class NameHandler {
    get(userId: string, guildId: string, gameType: GameTypes): string | undefined {
        let obj = fileHandler.read(FileTypes.NAMES, guildId as string);
        if (obj == undefined || obj[userId] == undefined) {
            return undefined;
        }
        return obj[userId][gameType];
    }

    set(userId: string, guildId: string, gameType: GameTypes, name: string) {
        let obj = fileHandler.read(FileTypes.NAMES, guildId as string);
        if (obj == undefined) {
            obj = {};
        }
        if (obj[userId] == undefined) {
            obj[userId] = {};
        }
        obj[userId][gameType] = name;
        fileHandler.write(FileTypes.NAMES, guildId as string, obj);
    }

    remove(userId: string, guildId: string, gameType: GameTypes) {
        let obj = fileHandler.read(FileTypes.NAMES, guildId as string);
        if (obj == undefined) {
            obj = {};
            return;
        }
        if (obj[userId] == undefined) {
            obj[userId] = {};
            return;
        }
        delete obj[userId][gameType];
        fileHandler.write(FileTypes.NAMES, guildId as string, obj);
    }
}

export enum GameTypes {
    OSU = "osu",
    VALORANT = "valorant"
}