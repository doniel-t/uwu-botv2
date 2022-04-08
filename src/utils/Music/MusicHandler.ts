import { AudioPlayer } from '@discordjs/voice';
import { GuildMusicPlayer } from './GuildMusicPlayer';
import { ILiteEvent } from '../LiteEvent';

export class MusicHandler {

    public PlayEnd(guildId: string): ILiteEvent<void> { return this.getGuildMusicPlayerFromId(guildId).PlayEnd }

    private players: Map<string, GuildMusicPlayer> = new Map();

    async addYoutubeToQueue(guildId: string, link: string): Promise<boolean> {
        return await this.getGuildMusicPlayerFromId(guildId).addYoutubeToQueue(link);
    }

    async addYoutubePlaylistToQueue(guildId: string, link: string): Promise<boolean> {
        return await this.getGuildMusicPlayerFromId(guildId).addYoutubePlaylistToQueue(link);
    }

    getPlayer(guildId: string): AudioPlayer {
        return this.getGuildMusicPlayerFromId(guildId).getPlayer();
    }

    async play(guildId: string): Promise<boolean> {
        return (await this.tryGetGuildMusicPlayerFromId(guildId)?.play()) ?? false;
    }

    pause(guildId: string) {
        this.tryGetGuildMusicPlayerFromId(guildId)?.pause();
    }

    resume(guildId: string) {
        this.tryGetGuildMusicPlayerFromId(guildId)?.resume();
    }

    stop(guildId: string) {
        this.tryGetGuildMusicPlayerFromId(guildId)?.stop();
        if (this.players.has(guildId)) {
            this.players.delete(guildId);
        }
    }

    async skip(guildId: string): Promise<boolean> {
        return (await this.tryGetGuildMusicPlayerFromId(guildId)?.skip()) ?? false;
    }

    getQueueLength(guildId: string): number {
        return this.tryGetGuildMusicPlayerFromId(guildId)?.getQueueLength() ?? 0;
    }

    private tryGetGuildMusicPlayerFromId(guildId: string): GuildMusicPlayer | undefined {
        return this.players.get(guildId);
    }

    private getGuildMusicPlayerFromId(guildId: string): GuildMusicPlayer {
        if (this.players.has(guildId)) {
            //@ts-ignore 2232
            return this.players.get(guildId);
        }
        let player = new GuildMusicPlayer();
        player.PlayEnd.on(() => {
            this.players.delete(guildId);
        });
        this.players.set(guildId, player);
        return player;
    }
}

