import { createAudioResource, demuxProbe } from "@discordjs/voice";
import ytpl from "ytpl";
import { YoutubeMusicResource } from "./YoutubeMusicResource";

export class YouTubePlaylistHandler {

    private link: string;

    constructor(link: string) {
        this.link = link;
    }

    async getSongs(random: boolean): Promise<YoutubeMusicResource[] | undefined> {
        return await ytpl(this.link, {
            limit: Infinity
        })
            .then(playlist => {
                let list = playlist.items.map(item => {
                    return new YoutubeMusicResource(item.shortUrl);
                });
                if (!random) {
                    return list;
                } else {
                    return shuffle(list);
                }
            }).catch(ex => {
                console.log(ex);
                return undefined;
            })
    }
}

function shuffle<T>(array: T[]): T[] {
    var currentIndex = array.length, temporaryValue, randomIndex;

    while (0 !== currentIndex) {

        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}