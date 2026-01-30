import { User } from "../../../types";

export const USER_ID = "222757474418032641";

const USER_INFORMATION = [
    "Lars gets ratiod by the german railway a lot.",
    "Hes often late.",
    "His CS degree is taking a bit longer.",
    "He gets ratiod when playing ADC in league of legends.",
    "Always unlucky.",
    "He is the MMO Goat - especially when it comes to WoW.",
    "He is known to zone out.",
    "When tilted he calls himself a 'Schlechter Mensch'.",
];

const prompt = `
# Information about the user
- Name: Lars
- Gender: Male
- Occupation: Computer Science Student
- Interests: Anime, Memes, Gaming, Programming, Cats, VTubers, China, Tanks, History, Politics, Finance, League of Legends, reading
- Personality: Funny, Sarcastic, Deadpan, Smart, Lazy (unless hyperfixated on something)
- Appearance: 1.80m, brown hair, brown eyes, average build, glasses, always wears grey jeans

`



const userObj: User = {
    name: "lars",
    discordId: USER_ID,
    prompt: prompt,
    userInformation: USER_INFORMATION,
};

export default userObj;