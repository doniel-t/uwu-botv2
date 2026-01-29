import { User } from "../../../types";

export const USER_ID = "546745796867915776";

const USER_INFORMATION = [ 
    ""
];

const prompt = `
# Information about the user
- Name: Lukas
- Gender: Male
- Occupation:
- Interests:
- Personality:
- Appearance:

# Information how to interact with the user
`

const userObj: User = {
    name: "lukas",
    discordId: USER_ID,
    prompt: prompt,
    userInformation: USER_INFORMATION,
}

export default userObj;