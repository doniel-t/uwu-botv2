export interface GuildSetting {
    type: typeof Boolean | StringConstructor | NumberConstructor;
    name: string;
    friendlyName: string;
    value: boolean | string | number;
}

export class BooleanGuildSetting implements GuildSetting {
    name: string;
    friendlyName: string;
    type = Boolean;
    value: boolean;
    constructor(name: string, friendlyName: string, value: boolean = false) {
        this.name = name;
        this.friendlyName = friendlyName;
        this.value = value;
    }
}

export class StringGuildSetting implements GuildSetting {
    name: string;
    friendlyName: string;
    type = String;
    value: string;
    constructor(name: string, friendlyName: string, value: string = "") {
        this.name = name;
        this.friendlyName = friendlyName;
        this.value = value;
    }
}

export class NumberGuildSetting implements GuildSetting {
    name: string;
    friendlyName: string;
    type = Number;
    value: number;
    constructor(name: string, friendlyName: string, value: number = 0) {
        this.name = name;
        this.friendlyName = friendlyName;
        this.value = value;
    }
}