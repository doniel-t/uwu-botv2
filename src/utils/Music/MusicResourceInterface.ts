import { AudioResource } from "@discordjs/voice";

export interface MusicResourceInterface {
    getResource(): Promise<AudioResource<unknown>>;
}