import { User } from "../../../types";

export const USER_ID = "665990659169058851";

const USER_INFORMATION = [ 
    ""
];

const prompt = `
# Information about the user
- Name: Heiko
- Gender: Male
- Occupation:
- Interests:
- Personality:
- Appearance:

# Information how to interact with the user
`


const userObj: User = {
    name: "heiko",
    discordId: USER_ID,
    prompt: prompt,
    userInformation: USER_INFORMATION,
}

export default userObj;