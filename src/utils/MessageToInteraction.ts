import DiscordJS, { Message } from "discord.js";

export function messageToInteraction(message: Message, numberOfOptions: number | undefined): DiscordJS.CommandInteraction {
    let optionsCache: any = {};
    function getOption(name: string, content: string) {
        if (numberOfOptions == undefined || numberOfOptions == 0) return [null, content];
        if (optionsCache[name]) return [optionsCache[name], content];

        let array = content.split(" ");
        if (array.length < 2)
            return [null, content];

        let command = array.shift();

        if (numberOfOptions == 1) {
            optionsCache[name] = array.join(" ");
            return [optionsCache[name], command];
        }

        optionsCache[name] = array.shift();
        return [optionsCache[name] ?? null, (command + " " + array.join(" ")) ?? ""];
    }
    let firstReply: DiscordJS.Message<boolean> | undefined = undefined;
    let interaction = {
        reply: async (msg: any) => { firstReply = await message.channel?.send(msg) },
        guildId: message.guildId,
        user: message.author,
        member: message.member,
        channel: message.channel,
        options: {
            get: (name: string, required = false) => {
                let result = getOption(name, message.content);
                //@ts-ignore 2322
                message.content = result[1];
                return result[0];
            },
            getBoolean: (name: string, required = false) => {
                let result = getOption(name, message.content);
                //@ts-ignore 2322
                message.content = result[1];
                return result[0];
            },
            getInteger: (name: string, required = false) => {
                let result = getOption(name, message.content);
                //@ts-ignore 2322
                message.content = result[1];
                return result[0];
            },
            getNumber: (name: string, required = false) => {
                let result = getOption(name, message.content);
                //@ts-ignore 2322
                message.content = result[1];
                return result[0];
            },
            getString: (name: string, required = false) => {
                let result = getOption(name, message.content);
                //@ts-ignore 2322
                message.content = result[1];
                return result[0];
            },
            getSubcommand: (name: string, required = false) => {
                let result = getOption(name, message.content);
                //@ts-ignore 2322
                message.content = result[1];
                return result[0];
            },
        },
        deferReply: () => { },
        //@ts-ignore 2683
        editReply: (msg: any) => {
            if (!firstReply)
                message.channel?.send(msg)
            else {
                firstReply.edit(msg);
            }
        },
    }
    return interaction as unknown as DiscordJS.CommandInteraction;
}