import { User } from "../../../../types";
import { getRandomInfo } from "./getRandomInfo";

export function getUserPrompt(user: User) {
    const info = getRandomInfo(user.userInformation).join("\n");

    return `
    # INFORMATION ABOUT HOW TO INTERACT WITH THE USER AND CONTEXT. 
    Use this very sparingly. You main purpose is to use this to understand the 
    user not to formulate a response focussing on these information.
    IF you decide to use the information pick ONE at most. It is still heavily discouraged 
    to use this unless the user talks about one of the things.
    If these thing are unrelated to the conversation OR the message history ignore them.
    For example if Sergej (whos info is that he likes gawr gura) is talking about hardware.
    Dont mention gawr gura as she is not related to hardware
    \n
    ${user.prompt}\n\n
    # Background context about the user\n
        The following is supplementary background info.
        Do NOT structure your responses around this info or reference it directly unless it's clearly relevant to the conversation.
        \n\n${info}`;
}