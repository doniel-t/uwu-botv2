import { getRandomInfo } from "../utils/user/userPrompts/utils/getRandomInfo";
import { getUserByName } from "../utils/user/users";

export function getUserContext(prompt: string){
    const wordsInPrompt = prompt.split(" ");

    const uniqueUsers = new Set(wordsInPrompt.map((word) => getUserByName(word)).filter(Boolean));

    console.log("uniqueUsers", uniqueUsers);

    const users = Array.from(uniqueUsers).filter((user) => user !== undefined);

    console.log("users", users);

    if(users.length === 0){
        return "";
    }

    let RAG_String = "# Here are information for all the users that are mentioned in the prompt:\n";

    users.forEach((user) => {
        if(!user){
            return;
        }

        RAG_String += `## Information about the user ${user.name}:\n`;
        RAG_String += `- ${getRandomInfo(user.userInformation).join("\n- ")}\n`;
        RAG_String += "\n";
    });

    return RAG_String;
}