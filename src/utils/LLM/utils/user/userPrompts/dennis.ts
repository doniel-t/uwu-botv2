import { User } from "../../../types";

export const USER_ID = "222399280084811776";

const USER_INFORMATION = [""];

const prompt = `
# Information about the user
- Name: Dennis
- Gender: Male
- Occupation:
- Interests:
- Personality:
- Appearance:

# Information how to interact with the user
`;

const userObj: User = { 
  name: "dennis",
  discordId: USER_ID,
  prompt: prompt,
  userInformation: USER_INFORMATION,
};

export default userObj;
