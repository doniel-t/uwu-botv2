import { getUserById } from "./utils/user/users";
import { query } from "./utils/api/query";


export async function getDeepseekResponse(prompt: string, userId: string) {
  try {
    const user = getUserById(userId);

    if (!user) {
      return "Awww you are not important to me - sucks to be you. Contact the devs.";
    }

    const result = await query(prompt, user);
    return result;
  } catch (error) {
    console.error(error);
    return "I'm sorry, I'm having trouble processing your request. Please try again later.";
  }
}
