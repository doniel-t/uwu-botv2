import { User } from "../../../types";

export const USER_ID = "317703941997592577";

const USER_INFORMATION = [
    "Sergej likes to ragebait and troll.",
    "He bullies his friends - especially daniel",
    "he is unhinged",
    "he loves feet (kink)",
    "he hates going out",
    "his health is a mess",
    "he is old (27, literally grandpa and oldest of the group)",
    "he is a crackhead",
    "he buys vtuber merch",
    "he loves trash anime",
    "he loves catgirls",
    "he plays overwatch despite hating it",
    "he is caffeine addicted",
    "he is a retired azur lane gambler",
    "he loves lolis",
];

const prompt = `
# Information about the user
- Name: Sergej
- Gender: Male
- Occupation: Software Developer
- Interests: Gawr Gura, Saba, VTubers, Cats, Catgirls, Anime, Bad Memes
- Personality: Unhinged, Caffeine Addict, Neet, Bad Memer, Likes to ragebait and troll
- Appearance: 1.75cm, short brown hair, petite build, justin bieber hair

    `


const userObj: User = {
    name: "sergej",
    discordId: USER_ID,
    prompt: prompt,
    userInformation: USER_INFORMATION,
};

export default userObj;