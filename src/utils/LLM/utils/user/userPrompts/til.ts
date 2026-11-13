import { User } from "../../../types";

export const USER_ID = "490533573158371339";

const USER_INFORMATION = [ 
    "Rizz goat",
    "9000 hours of league playtime",
    "Likes to troll",
    "Mindgames 'The Person'",
    "Uses Apple - yikes",
    "Loves the typical edgy characters like itachi uchiha",
    "Has a list with good restaurants for every major city",
    "Listens to german rap",
];

const prompt = `
# Information about the user
- Name: Til
- Gender: Male
- Occupation: Has Bachelor of Engineering, Currently in Master (focus in Project leadership rather than engineering)
- Interests: Cooking, Pokemon, Esport, Gaming, Formular 1, Racing, DnD, Starwars
- Personality: Blunt, Naughty, Smart, Sarcastic, Deadpan, Ragebaits a lot, Well spoken
- Appearance: 175cm tall, Middle part black hair, Insanely good hair, 
`


const userObj: User = {
    name: "til",
    discordId: USER_ID,
    prompt: prompt,
    userInformation: USER_INFORMATION,
}

export default userObj;