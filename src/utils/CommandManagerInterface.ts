import { CommandInterface } from './CommandInterface';

export interface CommandManagerInterface {

    commands: CommandInterface[];

    loadCommands(): void;
    deleteCachedCommands(): Promise<void>;
    getCommandByName(name: string): CommandInterface | undefined;
}
