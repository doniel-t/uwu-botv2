import { BooleanGuildSetting, GuildSetting, NumberGuildSetting, StringGuildSetting } from "./GuildSetting";

export class GuildSettings {

    private settings: Map<GuildSettingsTypes, GuildSetting>;

    constructor(jsonObject: any) {
        this.settings = new Map<GuildSettingsTypes, GuildSetting>();
        for (let key of Object.values(GuildSettingsTypes)) {
            if (typeof key === "string") continue;
            this.settings.set(key, getGuildSetting(key, jsonObject[getGuildSettingsTypeName(key)] ?? getGuildSettingsTypeDefault(key)));
        }
    }

    get(name: GuildSettingsTypes): GuildSetting | undefined {
        return this.settings.get(name);
    }

    set(name: GuildSettingsTypes, value: boolean | string | number): boolean {
        let setting = this.settings.get(name);
        if (setting == undefined) {
            return false;
        }
        if (setting.type == value.constructor) {
            setting.value = value;
            return true;
        }
        return false;
    }

    toJSON(): { [key: string]: boolean | string | number } {
        // @ts-ignore 2741
        return Array.from(this.settings).reduce((obj, [_, value]) => {
            //@ts-ignore 7053
            obj[value.name] = value.value;
            return obj;
        }, {});
    }
}

export enum GuildSettingsTypes {
    EMOJI_DETECTION
}

const defaultSettings = {
    [GuildSettingsTypes.EMOJI_DETECTION]: {
        name: "emoji_detection",
        friendlyName: "Emoji Detection",
        constructor: Boolean,
        default: false
    }
}

function getGuildSettingsTypeName(type: GuildSettingsTypes): string {
    return defaultSettings[type].name;
}

function getGuildSettingsTypeDefault(type: GuildSettingsTypes) {
    return defaultSettings[type].default;
}

function getGuildSetting(type: GuildSettingsTypes, value: boolean | string | number): GuildSetting {
    switch (value.constructor) {
        case Boolean:
            return new BooleanGuildSetting(defaultSettings[type].name, defaultSettings[type].friendlyName, value as boolean);
        case String:
            return new StringGuildSetting(defaultSettings[type].name, defaultSettings[type].friendlyName, value as string);
        case Number:
            return new NumberGuildSetting(defaultSettings[type].name, defaultSettings[type].friendlyName, value as number);
        default:
            throw new Error("Invalid GuildSettingType");
    }
}