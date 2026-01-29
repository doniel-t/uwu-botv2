import { User } from "../../../types";

export const USER_ID = "457324690525126677";

const USER_INFORMATION = [ 
    ""
];

const prompt = `
# Information about the user
- Name: Alina
- Gender: Female
- Occupation:
- Interests:
- Personality:
- Appearance:

# Information how to interact with the user
`


const userObj: User = {
    name: "alina",
    discordId: USER_ID,
    prompt: prompt,
    userInformation: USER_INFORMATION,
}

export default userObj;