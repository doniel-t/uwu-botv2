import { CommandInterface } from './CommandInterface';
import requireDir from 'require-dir';
import { client } from '../../index';
import { CommandManagerInterface } from './CommandManagerInterface';

export class DefaultCommandManager implements CommandManagerInterface {

    commands: CommandInterface[] = [];

    constructor() {
        this.loadCommands();
    }

    loadCommands(): void {
        if (client.application == null) {
            throw new Error("No client application found")
        }
        
        let dirs = { ...requireDir("../../Commands"), ...requireDir("../../AdminCommands") };

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
            if (command.name == undefined) return;
            if (command.description == undefined) return;
            client.application?.commands.create({
                name: command.name,
                description: command.description,
                //@ts-ignore 2322
                options: command.options
            });
        });
    }

    getCommandByName(name: string): CommandInterface | undefined {
        return this.commands.find(command => command.name === name || command.shortcut === name);
    }
}
