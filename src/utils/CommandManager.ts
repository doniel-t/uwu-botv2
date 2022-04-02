import { CommandInterface } from './CommandInterface';
import { addCommand } from '../Commands/Add';
import { askCommand } from '../Commands/Ask';

export class CommandManager{

    commands : CommandInterface[] = [];

    constructor(){
        this.loadAllCommands();
    }

    //loads all exported obj from command ts file
    loadAllCommands() : void{
        this.commands.push(addCommand);
        this.commands.push(askCommand);
    }

    getAllCommands() : CommandInterface[]{
        return this.commands;
    }

    getCommandByName(name : string) : CommandInterface | undefined{
        return this.commands.find(command => command.name === name);
    }

}
