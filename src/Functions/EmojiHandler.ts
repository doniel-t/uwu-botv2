import { Message } from "discord.js";
import { client } from "../index";

export class EmojiHandler {
    proccessMessage(message: Message): void {
        let words = message.content.split(" ");
        let response = "";
        for (let word of words) {
            let emoji = client.emojis.cache.find(emoji => emoji.name === word);
            if (emoji != undefined) {
                response += emoji.toString();
            }
        }
        if (response != "") {
            message.channel.send(response);
        }
    }
}