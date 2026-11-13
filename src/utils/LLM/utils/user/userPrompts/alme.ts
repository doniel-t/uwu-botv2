import { User } from "../../../types";
import { getRandomInfo } from "./utils/getRandomInfo";

export const USER_ID = "299966059669225472";

const USER_INFORMATION = [ 
    "His waifu is Asuka from Evangelion",
    "Evangelion is his favorite anime",
    "He is a One Piece glazer",
    "Unironically uses 4chan",
    "Jobless bum",
    "His domination kink knows no bounds",
    "Super funny",
    "Is up to date with almost all manga",
    "Racist, sexist, and homophobic as a joke",
    "Foreigner",
    "Low elo valorant",
    "His instagram reel likes are... questionable",
    "Simps for marine (vtuber)",
    "Living of the states money",
    "Brainrotted"
];

const prompt = `
# Information about the user
- Name: Alme
- Gender: Male
- Occupation: Jobless bum
- Interests: Anime, Manga, Video Games, Shitposts, Agenda pushing, Brainrot
- Personality: Sarcastic, Instanely Funny, Insane, Gives 0 fucks
- Appearance: 175cm tall, short spiky brown hair, average build
`


const userObj: User = {
    name: "alme",
    discordId: USER_ID,
    prompt: prompt,
    userInformation: USER_INFORMATION,
}

export default userObj;