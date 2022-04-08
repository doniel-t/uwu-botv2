import { createAudioResource, demuxProbe } from "@discordjs/voice";
import ytpl from "ytpl";
import { YoutubeMusicResource } from "./YoutubeMusicResource";

export class YouTubePlaylistHandler {

    private link: string;

    constructor(link: string) {
        this.link = link;
    }

    async getSongs(): Promise<YoutubeMusicResource[] | undefined> {
        return await ytpl(this.link, {
            limit: Infinity
        })
            .then(playlist => {
                return playlist.items.map(item => {
                    return new YoutubeMusicResource(item.shortUrl);
                });
            }).catch(ex => {
                console.log(ex);
                return undefined;
            })
    }
}

async function probeAndCreateResource(readableStream: any) {
    const { stream, type } = await demuxProbe(readableStream);
    return createAudioResource(stream, { inputType: type });
}