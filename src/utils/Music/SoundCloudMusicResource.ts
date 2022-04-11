import { AudioResource, createAudioResource, demuxProbe } from "@discordjs/voice";
import { MusicResourceInterface } from "./MusicResourceInterface";
import SoundCloud from 'soundcloud-scraper';

export class SoundCloudMusicResource implements MusicResourceInterface {

    private static client: SoundCloud.Client = new SoundCloud.Client();
    private link: string;

    constructor(link: string) {
        this.link = link;
    }

    getName(): string {
        return this.link;
    }

    getAudioResource(): Promise<AudioResource<unknown>> {
        return SoundCloudMusicResource.client.getSongInfo(this.link)
            .then(async song => {
                const stream = await song.downloadProgressive();
                return await probeAndCreateResource(stream);
            });
    }

    static validateURL(link: string): boolean {
        return link.match(/^(?:(https?):\/\/)?(?:(?:www|m)\.)?soundcloud\.com\/[a-z0-9](?!.*?(-|_){2})[\w-]{1,23}[a-z0-9](?:\/.+)?$/) !== null;;
    }
}

async function probeAndCreateResource(readableStream: any) {
    const { stream, type } = await demuxProbe(readableStream);
    return createAudioResource(stream, { inputType: type });
}