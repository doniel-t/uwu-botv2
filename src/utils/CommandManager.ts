import { CommandInterface } from './CommandInterface';
import requireDir from 'require-dir';
import { client } from '../index';

export class CommandManager {

    commands: CommandInterface[] = [];

    constructor() {
        this.loadAllCommands();
    }

    //loads all exported obj from command ts file
    async loadAllCommands(): Promise<void> {
        if (client.application == null) {
            throw new Error("No client application found")
        }
        //@ts-ignore 2345
        let dirs = { ...requireDir("../Commands", { noCache: true }), ...requireDir("../AdminCommands", { noCache: true }) };
        for (let name in dirs) {
            let command = dirs[name].getInstance();
            if (command.shortcut) {
                let sCommand = dirs[name].getInstance();
                sCommand.name = sCommand.shortcut;
                this.commands.push(sCommand);
            }
            this.commands.push(command);
        }

        this.commands.forEach(command => {
            if(command.name == undefined) return;
            if(command.description == undefined) return;
            if(command.shortcut){
                client.application?.commands?.create({
                    name:command.shortcut,
                    description: command.description,
                    //@ts-ignore 2322
                    options: command.options
                });
            }
            client.application?.commands?.create({
                name:command.name,
                description: command.description,
                //@ts-ignore 2322
                options: command.options
            });
            
        });
    }

    getCommandByName(name: string): CommandInterface | undefined {
        return this.commands.find(command => command.name === name || command.shortcut === name);
    }

    reloadCommands(): void {
        this.commands = [];
        client.application?.commands.cache.clear();
        this.loadAllCommands();
    }
}
