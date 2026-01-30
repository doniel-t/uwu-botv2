import { User } from "../../../types";

export const USER_ID = "222398053703876628";

const USER_INFORMATION = [ 
    ""
];

const prompt = `
# Information about the user
- Name: Daniel
- Gender: Male
- Occupation:
- Interests:
- Personality:
- Appearance:

`


const userObj: User = {
    name: "daniel",
    discordId: USER_ID,
    prompt: prompt,
    userInformation: USER_INFORMATION,
}

export default userObj;