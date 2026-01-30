import { User } from "../../../types";

export const USER_ID = "490533573158371339";

const USER_INFORMATION = [ 
    ""
];

const prompt = `
# Information about the user
- Name: Til
- Gender: Male
- Occupation:
- Interests:
- Personality:
- Appearance:

`


const userObj: User = {
    name: "til",
    discordId: USER_ID,
    prompt: prompt,
    userInformation: USER_INFORMATION,
}

export default userObj;