import { User } from "../../../../types";
import { getRandomInfo } from "./getRandomInfo";

export function getUserPrompt(user: User) {
    const info = getRandomInfo(user.userInformation).join("\n");

    return `${user.prompt}\n\n# Background context about the user\n
        The following is supplementary background info. Do NOT structure your responses around this info or reference it directly unless it's clearly relevant to the conversation. Focus on responding naturally to the message history.
        \n\n${info}`;
}