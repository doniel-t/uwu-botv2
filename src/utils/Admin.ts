import { GuildMember, Interaction } from "discord.js";

export function isAdmin(interaction : Interaction) {
    let isDev = DEVS.includes(interaction.user.id);
    if (isDev)
        return true;

    if (interaction.guildId !== null) 
        return isAdminInServer(interaction);
    else
        return false;
}

function isAdminInServer(interaction : Interaction) {
    const member = interaction.member as GuildMember;
    return member.permissions.has('ADMINISTRATOR');
}

const DEVS = [ //DiscordIDs
    '270929192399536138', //ackhack
    '222398053703876628', //Daniel
    '222757474418032641', //Lars
    '317703941997592577', //Sergej
]