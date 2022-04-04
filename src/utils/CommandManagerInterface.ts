import { CommandInterface } from './CommandInterface';

export interface CommandManagerInterface {

    commands: CommandInterface[];

    loadCommands(): void;
    getCommandByName(name: string): CommandInterface | undefined;
}
