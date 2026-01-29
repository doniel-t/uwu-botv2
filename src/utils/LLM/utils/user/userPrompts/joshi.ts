import { User } from "../../../types";

export const USER_ID = "243841370710736896";

const USER_INFORMATION = [ 
    ""
];

const prompt = `
# Information about the user
- Name: Joshi
- Gender: Male
- Occupation:
- Interests:
- Personality:
- Appearance:

# Information how to interact with the user
`


const userObj: User = { 
    name: "joshi",
    discordId: USER_ID,
    prompt: prompt,
    userInformation: USER_INFORMATION,
}

export default userObj;