import { GuildMember, Interaction } from "discord.js";

export function isAdmin(interaction : Interaction) {
    let isDev = DEVS.includes(interaction.user.id);
    return isDev || isAdminInServer(interaction);
}

function isAdminInServer(interaction : Interaction) {
    const member = interaction.member as GuildMember;
    return member.permissions.has('ADMINISTRATOR');
}

const DEVS = require('./DevList.json');