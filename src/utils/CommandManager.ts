import { CommandInterface } from './CommandInterface';

export class CommandManager{

    commands : CommandInterface[] = [];

    initCommands() : void{
        //load commands from directory
    }

    getAllCommands() : CommandInterface[]{
        return this.commands;
    }

    getCommandByName(name : string) : CommandInterface | undefined{
        return this.commands.find(command => command.name === name);
    }

}
