import { AudioResource } from "@discordjs/voice";

export interface MusicResourceInterface {
    getName(): string;
    getAudioResource(): Promise<AudioResource<unknown>>;
}