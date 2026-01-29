import { User } from "../../../types";

export const USER_ID = "169165536544948224";

const USER_INFORMATION = [ 
    ""
];

const prompt = `
# Information about the user
- Name: Tom
- Gender: Male
- Occupation:
- Interests:
- Personality:
- Appearance:

# Information how to interact with the user
`

const userObj: User = {
    name: "tom",
    discordId: USER_ID,
    prompt: prompt,
    userInformation: USER_INFORMATION,
}

export default userObj;