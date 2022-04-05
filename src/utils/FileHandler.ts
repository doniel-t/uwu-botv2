import { Guild } from "discord.js";
import { client } from "../index";
import fs from "fs";
import path from "path";
import { GuildSettings } from "./GuildSettings";

export class FileHandler {

    read(fileType: FileTypes, guildId: string) {
        return require(`../../Files/${guildId}/${fileType}`);
    }

    write(fileType: FileTypes, guildId: string, content: any): boolean {
        return writeFile(`Files/${guildId}/${fileType}`, JSON.stringify(content));
    }

    initSettings(): Map<string, GuildSettings> {
        try {
            let defaultSettings = require("../../Files/defaultSettings.json");
            let settingsDict = new Map<string, GuildSettings>();

            client.guilds.cache.forEach((guild: Guild) => {
                if (!fs.existsSync(`Files/${guild.id}`))
                    fs.mkdirSync(`Files/${guild.id}/`);
                if (!fs.existsSync(`Files/${guild.id}/${FileTypes.SETTINGS}`))
                    this.write(FileTypes.SETTINGS, guild.id, defaultSettings);

                settingsDict.set(guild.id, new GuildSettings(this.read(FileTypes.SETTINGS, guild.id)));
            });
            return settingsDict;
        } catch (err) {
            console.log(err);
            return new Map<string, GuildSettings>();
        }
    }
}

export enum FileTypes {
    SETTINGS = "settings.json",
    NAMES = "names.json",
}

function writeFile(filePath: string, content: any): boolean {
    try {
        //@ts-ignore 2345
        fs.writeFileSync(path.join(filePath, ""), content, { recursive: true });
        return true;
    } catch (error) {
        console.log(error);
        return false;
    }
}