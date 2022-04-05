export class GuildSettings {

    private settings: Map<GuildSettingsTypes, boolean | string | number>;

    constructor(jsonObject: any) {
        this.settings = new Map<GuildSettingsTypes, boolean | string | number>();
        for (let setting in GuildSettingsTypes) {
            //@ts-ignore 2551
            this.set(GuildSettingsTypes[setting as GuildSettingsTypes],
                //@ts-ignore 2551
                jsonObject[setting] ?? this.getDefault(GuildSettingsTypes[setting as GuildSettingsTypes]));
        }
    }

    get(name: GuildSettingsTypes): boolean | string | number | undefined {
        return this.settings.get(name);
    }

    set(name: GuildSettingsTypes, value: boolean | string | number) {
        this.settings.set(name, value);
    }

    getDefault(name: GuildSettingsTypes): boolean | string | number {
        switch (name) {
            case GuildSettingsTypes.EMOJI_DETECTION:
                return false;
            default:
                return false;
        }
    }

    toJSON(): { [key: string]: boolean | string | number} {
        // @ts-ignore 2741
        return Array.from(this.settings).reduce((obj, [key, value]) => {
            //@ts-ignore 7053
            obj[key] = value;
            return obj;
        }, {});
    }
}

export enum GuildSettingsTypes {
    EMOJI_DETECTION = "emojiDetection",
}