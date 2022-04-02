export function isAdmin(userId:string,guildId:string | null) {
    let isDev = Devs.includes(userId);
    if (isDev)
        return true;

    if (guildId !== null) 
        return isAdminInServer(userId,guildId);
    else
        return false;
}

function isAdminInServer(userId:string,guildId:string) {
    //TODO: check if user is admin
    return false;
}

const Devs = [ //DiscordIDs
    '270929192399536138', //ackhack
    '222398053703876628', //Daniel
    '222757474418032641', //Lars
    '317703941997592577', //Sergej
]