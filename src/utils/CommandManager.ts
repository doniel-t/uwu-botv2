import { CommandInterface } from './CommandInterface';
import { addCommand } from '../Commands/Add';
import { askCommand } from '../Commands/Ask';
import DiscordJS, { Intents, Interaction } from 'discord.js';

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
        return this.commands.find(command => command.name === name || command.shortcut === name);
    }

    registerCommands(commands : any) : void{

        this.commands.forEach(command => {
            if(command.name == undefined) return;
            if(command.description == undefined) return;
            if(command.shortcut){
                commands?.create({
                    name:command.shortcut,
                    description: command.description,
                    options: command.options
                });
            }
            commands?.create({
                name:command.name,
                description: command.description,
                options: command.options
            });
            
        });
    }
}
