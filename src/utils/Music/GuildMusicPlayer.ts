import { AudioPlayer, AudioPlayerStatus, createAudioPlayer } from '@discordjs/voice';
import ytdl from 'ytdl-core';
import ytpl from 'ytpl';
import { LiteEvent } from '../LiteEvent';
import { MusicResourceInterface } from './MusicResourceInterface';
import { YoutubeMusicResource } from './YoutubeMusicResource';
import { YouTubePlaylistHandler } from './YouTubePlaylistHandler';

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

    async addYoutubePlaylistToQueue(link: string, random: boolean): Promise<boolean> {
        if (link == undefined || link == "" || link == null) return false;

        if (!ytpl.validateID(link)) return false;

        let playlist = await new YouTubePlaylistHandler(link).getSongs(random);

        if (playlist == undefined) return false;

        playlist.forEach(song => {
            this.musicQueue.push(song);
        });
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
        return this.playNextResource() !== undefined;
    }

    pause() {
        this.player?.pause();
    }

    resume() {
        this.player?.unpause();
    }

    async skip(): Promise<string | undefined> {
        let nextSong = await this.playNextResource();
        return nextSong ? nextSong.getName() : undefined;
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

    private async playNextResource(): Promise<MusicResourceInterface | undefined> {
        let musicResource = await this.popQueue();
        if (musicResource == undefined) {
            this.stop();
            return undefined;
        }
        //@ts-ignore 2345
        this.player?.play(await musicResource.getAudioResource());
        this.running = true;
        return musicResource;
    }

    private async popQueue(): Promise<MusicResourceInterface | undefined> {
        if (this.musicQueue.length === 0) {
            return undefined;
        }
        return await this.musicQueue.pop();
    }
}