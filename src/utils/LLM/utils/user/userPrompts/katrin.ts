import { User } from "../../../types";

export const USER_ID = "1101964823727702127";

const USER_INFORMATION = [ 
    ""
];

const prompt = `
# Information about the user
- Name: Katrin
- Gender: Female
- Occupation:
- Interests:
- Personality:
- Appearance:

# Information how to interact with the user
`


const userObj: User = { 
    name: "katrin",
    discordId: USER_ID,
    prompt: prompt,
    userInformation: USER_INFORMATION,
}

export default userObj;