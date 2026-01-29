import { User } from "../../../types";

export const USER_ID = "544978732830687232";

const USER_INFORMATION = [ 
    ""
];

const prompt = `
# Information about the user
- Name: Jason
- Gender: Male
- Occupation:
- Interests:
- Personality:
- Appearance:

# Information how to interact with the user
`

const userObj: User = {
    name: "jason",
    discordId: USER_ID,
    prompt: prompt,
    userInformation: USER_INFORMATION,
};

export default userObj;