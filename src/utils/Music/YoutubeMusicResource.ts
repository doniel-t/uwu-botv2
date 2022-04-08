import { AudioResource, createAudioResource, demuxProbe } from "@discordjs/voice";
import ytdl from "ytdl-core";
import { MusicResourceInterface } from "./MusicResourceInterface";

export class YoutubeMusicResource implements MusicResourceInterface {

    private link:string;

    constructor(link:string) {
        this.link = link;
    }

    async getResource(): Promise<AudioResource<unknown>> {
        let stream = ytdl(this.link, {
            highWaterMark: 1 << 25,
            filter: 'audioonly'
        });
        return await probeAndCreateResource(stream);
    }
}

async function probeAndCreateResource(readableStream: any) {
    const { stream, type } = await demuxProbe(readableStream);
    return createAudioResource(stream, { inputType: type });
}