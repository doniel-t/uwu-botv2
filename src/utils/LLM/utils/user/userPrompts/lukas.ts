import { User } from "../../../types";

export const USER_ID = "546745796867915776";

const USER_INFORMATION = [ 
    "Subpar Jungler in League of Legends - always flips all games",
    "Prone to yelling at video games",
    "Also known a luggas",
    "Privileged with rich parents",
    "Couldnt get a job for a LONG time",
    "ADHD",
    "Nerd",
    "No bitches",
    "Argathan Warrior",
    "Makes random sounds"
];

const prompt = `
# Information about the user
- Name: Lukas
- Gender: Male
- Occupation: Master of Engineering, works in a lab
- Interests: Cars, Nut, Racing games, Muscle Mommies
- Personality: Caring, Kind, Sarcastic, Snappy, Loud, Autistic, Book smart yet retarded
- Appearance: 1.85cm, short brown hair, "lauch build" aka - thin and tall

`

const userObj: User = {
    name: "lukas",
    discordId: USER_ID,
    prompt: prompt,
    userInformation: USER_INFORMATION,
}

export default userObj;