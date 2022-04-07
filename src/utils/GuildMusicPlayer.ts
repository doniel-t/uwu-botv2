import { AudioPlayer, AudioPlayerStatus, AudioResource, createAudioPlayer, createAudioResource, demuxProbe } from '@discordjs/voice';
import ytdl from 'ytdl-core';
import { LiteEvent } from './LiteEvent';

export class GuildMusicPlayer {
    private player: AudioPlayer | undefined;
    private musicQueue: AudioResource[] = [];
    running = false;
    private readonly onPlayEnd = new LiteEvent<void>();
    public get PlayEnd() { return this.onPlayEnd.expose(); }
    
    async addYoutubeToQueue(link: string): Promise<boolean> {
        if (link == undefined || link == "" || link == null) return false;

        if (!ytdl.validateURL(link)) return false;

        try {
            let stream = ytdl(link, {
                highWaterMark: 1 << 25,
                filter: 'audioonly'
            });

            this.musicQueue.push(await probeAndCreateResource(stream));
            return true;
        } catch (err) {
            console.error(err);
            return false;
        }
    }

    getPlayer(): AudioPlayer {
        if (this.player != undefined) {
            return this.player;
        }

        this.player = createAudioPlayer();

        this.player.on('error', error => {
            console.error(error);
        });

        this.playNextResource();

        this.player.on(AudioPlayerStatus.Idle, () => {
            this.playNextResource();
        });

        return this.player;
    }

    play(): boolean {
        return this.playNextResource();
    }

    pause() {
        this.player?.pause();
    }

    resume() {
        this.player?.unpause();
    }

    skip(): boolean {
        return this.playNextResource();
    }

    stop() {
        this.player?.stop();
        this.onPlayEnd.trigger();
        this.player = undefined;
        this.musicQueue = [];
        this.running = false;
    }

    getQueueLength(): number {
        return this.musicQueue.length;
    }

    private playNextResource(): boolean {
        let resource = this.popQueue();
        if (resource == undefined) {
            this.stop();
            return false;
        }
        //@ts-ignore 2345
        this.player?.play(resource);
        this.running = true;
        return true;
    }

    private popQueue(): AudioResource | undefined {
        if (this.musicQueue.length === 0) {
            return undefined;
        }
        return this.musicQueue.pop();
    }
}

async function probeAndCreateResource(readableStream: any) {
    const { stream, type } = await demuxProbe(readableStream);
    return createAudioResource(stream, { inputType: type });
}