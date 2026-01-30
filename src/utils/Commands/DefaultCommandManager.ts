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

        const guild = client.guilds.cache.get(process.env.GUILD_ID as string);
        this.commands.forEach(command => {
            if (command.name == undefined) return;
            if (command.description == undefined) return;
            const commandData = {
                name: command.name,
                description: command.description,
                //@ts-ignore 2322
                options: command.options
            };
            if (guild) {
                guild.commands.create(commandData);
            } else {
                client.application?.commands.create(commandData);
            }
        });
    }

    getCommandByName(name: string): CommandInterface | undefined {
        return this.commands.find(command => command.name === name || command.shortcut === name);
    }
}
