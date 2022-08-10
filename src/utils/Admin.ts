import DiscordJS, { GuildMember } from "discord.js";

export function isAdmin(interaction : DiscordJS.BaseInteraction) {
    let isDev = DEVS.includes(interaction.user.id);
    return isDev || isAdminInServer(interaction);
}

function isAdminInServer(interaction : DiscordJS.BaseInteraction) {
    const member = interaction.member as GuildMember;
    if (!member) return false;
    return member.permissions.has("Administrator");
}

const DEVS = require('./DevList.json');