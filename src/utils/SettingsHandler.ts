import { fileHandler } from "../index";
import { FileTypes } from "./FileHandler";
import { GuildSetting } from "./GuildSetting";
import { GuildSettings, GuildSettingsTypes } from "./GuildSettings";

export class SettingsHandler {
    private guildSettingsDict: Map<string, GuildSettings>;
    valid = false;

    constructor(settings: Map<string, GuildSettings>) {
        this.guildSettingsDict = settings;
        this.saveAllSettings();
    }

    get(guildId: string | null, setting: GuildSettingsTypes): GuildSetting | undefined {
        if (guildId == null) {
            return undefined;
        }
        if (this.guildSettingsDict.has(guildId)) {
            return this.guildSettingsDict.get(guildId)?.get(setting);
        }
        return undefined;
    }

    set(guildId: string | null, setting: GuildSettingsTypes, value: boolean | string | number, saveFile: boolean = true): boolean {
        if (guildId == null || !this.guildSettingsDict.has(guildId) || setting == undefined) {
            return false;
        }
        this.guildSettingsDict.get(guildId)?.set(setting, value);
        if (saveFile) {
            fileHandler.write(FileTypes.SETTINGS, guildId, this.guildSettingsDict.get(guildId)?.toJSON());
        }
        return true;
    }

    getAllSettings(guildId: string | null): GuildSettings | undefined {
        if (guildId == null || !this.guildSettingsDict.has(guildId)) {
            return undefined;
        }
        return this.guildSettingsDict.get(guildId);
    }

    saveAllSettings() {
        this.guildSettingsDict.forEach((value, key) => {
            fileHandler.write(FileTypes.SETTINGS, key, value.toJSON());
        });
    }
}