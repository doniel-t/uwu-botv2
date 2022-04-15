import DiscordJS, { Message } from "discord.js";

export function messageToInteraction(message: Message): DiscordJS.CommandInteraction<DiscordJS.CacheType> {
    function getOption(content: string) {
        let array = content.split(" ");
        if (array.length < 2)
            return [null, content];
        let first = array.shift();
        let second = array.shift();
        return [second ?? null, (first + " " + array.join(" ")) ?? ""];
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
                let result = getOption(message.content);
                //@ts-ignore 2322
                message.content = result[1];
                return result[0];
            },
            getBoolean: (name: string, required = false) => {
                let result = getOption(message.content);
                //@ts-ignore 2322
                message.content = result[1];
                return result[0];
            },
            getInteger: (name: string, required = false) => {
                let result = getOption(message.content);
                //@ts-ignore 2322
                message.content = result[1];
                return result[0];
            },
            getNumber: (name: string, required = false) => {
                let result = getOption(message.content);
                //@ts-ignore 2322
                message.content = result[1];
                return result[0];
            },
            getString: (name: string, required = false) => {
                let result = getOption(message.content);
                //@ts-ignore 2322
                message.content = result[1];
                return result[0];
            },
            getSubcommand: (name: string, required = false) => {
                let result = getOption(message.content);
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
    return interaction as unknown as DiscordJS.CommandInteraction<DiscordJS.CacheType>;
}