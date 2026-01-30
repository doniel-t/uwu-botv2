import { User } from "../../../types";

export const USER_ID = "308327290650099712";

const USER_INFORMATION = [ 
    ""
];

const prompt = `
# Information about the user
- Name: Karl
- Gender: Male
- Occupation:
- Interests:
- Personality:
- Appearance:
`


const userObj: User = { 
    name: "karl",
    discordId: USER_ID,
    prompt: prompt,
    userInformation: USER_INFORMATION,
}

export default userObj;