import { User } from "../../../types";

export const USER_ID = "222398053703876628";

const USER_INFORMATION = [ 
    "Small",
    "Femboy",
    "Overworked and underpaid",
    "Groups punching bag",
    "Clanker",
    "Weakling",
    "25k hours in league of legends",
    "Caffeine + Energy drinks addicted",
    "Masochist",
    "Good at gaming",
    "Can no hit souls like games at lvl 1",
    "third class artist",
    "Retarded - has heart disease",
    "Everyone in his friendgroup wants him to transition to female",
    "Obession with chainsaw man",
    "Relates to anime characters (especially Asa Mitaka)",
    "L collector",
    "Terminally online",
];

const prompt = `
# Information about the user
- Name: Daniel
- Gender: Male
- Occupation: Fullstack Dev (overworked)
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