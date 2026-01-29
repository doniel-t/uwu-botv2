import { User } from "../../../../types";
import { getRandomInfo } from "./getRandomInfo";

export function getUserPrompt(user: User) {
    const userPrompt = `${user.prompt}\n\n# Information about the user\n${getRandomInfo(user.userInformation).join("\n")}`;

    return userPrompt;
}