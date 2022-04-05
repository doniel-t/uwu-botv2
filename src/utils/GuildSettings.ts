export class GuildSettings {

    private settings: Map<string, boolean | string | number>;

    constructor(jsonObject: any) {
        this.settings = new Map<string, boolean | string | number>();
        for (let key in jsonObject)
            if (key in GuildSettingsTypes)
                this.settings.set(key, jsonObject[key]);
    }

    get(name: GuildSettingsTypes): boolean | string | number | undefined {
        return this.settings.get(name);
    }
    set(name: GuildSettingsTypes, value: any) {
        this.settings.set(name, value);
    }
}

export enum GuildSettingsTypes {
    EMOJI_DETECTION = "emojiDetection",
}