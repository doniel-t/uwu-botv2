import { AudioPlayer, AudioPlayerStatus, AudioResource, createAudioPlayer, createAudioResource, demuxProbe } from '@discordjs/voice';
import ytdl from 'ytdl-core';
import { LiteEvent } from './LiteEvent';
import { MusicResourceInterface } from './MusicResourceInterface';
import { YoutubeMusicResource } from './YoutubeMusicResource';

export class GuildMusicPlayer {
    private player: AudioPlayer | undefined;
    private musicQueue: MusicResourceInterface[] = [];
    running = false;
    private readonly onPlayEnd = new LiteEvent<void>();
    public get PlayEnd() { return this.onPlayEnd.expose(); }

    addYoutubeToQueue(link: string): boolean {
        if (link == undefined || link == "" || link == null) return false;

        if (!ytdl.validateURL(link)) return false;

        this.musicQueue.push(new YoutubeMusicResource(link));
        return true;
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

    async play(): Promise<boolean> {
        return this.playNextResource();
    }

    pause() {
        this.player?.pause();
    }

    resume() {
        this.player?.unpause();
    }

    async skip(): Promise<boolean> {
        return await this.playNextResource();
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

    private async playNextResource(): Promise<boolean> {
        let resource = await this.popQueue();
        if (resource == undefined) {
            this.stop();
            return false;
        }
        //@ts-ignore 2345
        this.player?.play(resource);
        this.running = true;
        return true;
    }

    private async popQueue(): Promise<AudioResource | undefined> {
        if (this.musicQueue.length === 0) {
            return undefined;
        }
        return await this.musicQueue.pop()?.getResource();
    }
}

async function probeAndCreateResource(readableStream: any) {
    const { stream, type } = await demuxProbe(readableStream);
    return createAudioResource(stream, { inputType: type });
}