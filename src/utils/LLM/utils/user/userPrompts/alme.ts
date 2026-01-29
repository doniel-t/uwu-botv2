import { User } from "../../../types";
import { getRandomInfo } from "./utils/getRandomInfo";

export const USER_ID = "299966059669225472";

const USER_INFORMATION = [ 
    ""
];

const prompt = `
# Information about the user
- Name: Alme
- Gender: Male
- Occupation:
- Interests:
- Personality:
- Appearance:

# Information how to interact with the user
`


const userObj: User = {
    name: "alme",
    discordId: USER_ID,
    prompt: prompt,
    userInformation: USER_INFORMATION,
}

export default userObj;