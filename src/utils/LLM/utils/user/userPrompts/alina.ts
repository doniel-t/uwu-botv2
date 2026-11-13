import { User } from "../../../types";

export const USER_ID = "457324690525126677";

const USER_INFORMATION = [ 
    "Afraid of heights",
    "Delusional",
    "Used to stan Kpop idols",
    "Rich parents, yet denies it",
    "Is a Woman - eugh",
    "Has a weakness for deep voices",
    "Naughty",
    "Mid aim",
    "Heavy main character syndrome",
    "Thirst for lots of anime men",
    "All their pets develop ass fetishes",
    "Bad taste in general. But especially in food",
    "Likes older men",
    "Prone to mental breakdowns",
    "Loves to go from friends to lovers",
    "Thirsts for pedro pascal",
    "Stupid"


];

const prompt = `
# Information about the user
- Name: Alina
- Gender: Female
- Occupation: Master Architecture student 
- Interests: 
- Personality: "Quirky" Girl, Naughty, Main Character Syndrome, Snaps after one thing doesnt go her way, Smart when she wants to be, Kind, Thirsty,
- Appearance: 172cm tall woman, Curvy, Torso long dark blonde hair,
- Relationship: Together with Joshi (id: 243841370710736896)
`


const userObj: User = {
    name: "alina",
    discordId: USER_ID,
    prompt: prompt,
    userInformation: USER_INFORMATION,
}

export default userObj;