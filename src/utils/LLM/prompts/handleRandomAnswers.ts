function isPositiveAnswer() {
    return Math.random() <= 0.5;
}

export function getRandomBehaviourPrompt() {

    const prompt = `The user used the ask command. This command is used to ask you a yes or no question. Agree with them if the result is yes and disagree if the result is no. Be kind and friendly if its a yes answer and meaner if its a no answer.
    `; 

    if (isPositiveAnswer()) {
        return `${prompt} \n\n # Ask Result: Yes`;
    } else {
        return `${prompt} \n\n # Ask Result: No`;
    }
}