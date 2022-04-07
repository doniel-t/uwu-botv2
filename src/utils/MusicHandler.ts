import { AudioPlayer } from '@discordjs/voice';
import { GuildMusicPlayer } from './GuildMusicPlayer';
import { ILiteEvent } from './LiteEvent';

export class MusicHandler {

    public PlayEnd(guildId: string): ILiteEvent<void> { return this.getGuildMusicPlayerFromId(guildId).PlayEnd }

    private players: Map<string, GuildMusicPlayer> = new Map();

    async addYoutubeToQueue(guildId: string, link: string): Promise<boolean> {
        return await this.getGuildMusicPlayerFromId(guildId).addYoutubeToQueue(link);
    }

    getPlayer(guildId: string): AudioPlayer {
        return this.getGuildMusicPlayerFromId(guildId).getPlayer();
    }

    play(guildId: string) {
        this.getGuildMusicPlayerFromId(guildId).play();
    }

    pause(guildId: string) {
        this.getGuildMusicPlayerFromId(guildId).pause();
    }

    resume(guildId: string) {
        this.getGuildMusicPlayerFromId(guildId).resume();
    }

    stop(guildId: string) {
        this.getGuildMusicPlayerFromId(guildId).stop();
        this.players.delete(guildId);
    }

    skip(guildId: string): boolean {
        return this.getGuildMusicPlayerFromId(guildId).skip();
    }

    getQueueLength(guildId: string): number {
        return this.getGuildMusicPlayerFromId(guildId).getQueueLength();
    }

    private getGuildMusicPlayerFromId(guildId: string): GuildMusicPlayer {
        if (this.players.has(guildId)) {
            //@ts-ignore 2232
            return this.players.get(guildId);
        }
        let player = new GuildMusicPlayer();
        this.players.set(guildId, player);
        return player;
    }
}

