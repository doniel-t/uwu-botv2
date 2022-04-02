import { CommandInterface } from './CommandInterface';
import requireDir from "require-dir";
import { Add } from '../Commands/Add';

export class CommandManager{

    commands : CommandInterface[] = [require('../Commands/Add')];

    constructor(){
        this.initCommands();
    }

    initCommands() : void{
        this.commands.push(new Add());
    }

    getAllCommands() : CommandInterface[]{
        return this.commands;
    }

    getCommandByName(name : string) : CommandInterface | undefined{
        return this.commands.find(command => command.name === name);
    }

}
