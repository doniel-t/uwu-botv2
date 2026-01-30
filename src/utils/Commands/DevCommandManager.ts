import { DevCommandClass } from './DevCommand/DevCommand';
import { CommandInterface } from './CommandInterface';
import requireDir from 'require-dir';
import { client } from '../../index';
import { CommandManagerInterface } from './CommandManagerInterface';

export class DevCommandManager implements CommandManagerInterface {


    commands: CommandInterface[] = [];
    devCommands: DevCommandClass[] = [];

    constructor() {
        this.loadCommands();
    }


    async deleteCachedCommands(): Promise<void> {
        await client.application!.commands.set([]);
    }


    loadCommands(): void {
        if (client.application == null) {
            throw new Error("No client application found")
        }
        this.loadNormalCommands();
        this.loadDevCommands();
    }


    getCommandByName(name: string): CommandInterface | undefined {
        return this.commands.find(command => command.name === name || command.shortcut === name) || this.devCommands.find(command => command.name === name || command.shortcut === name);
    }
    

    loadNormalCommands(): void {
        //@ts-ignore 2345
        let dirs = { ...requireDir("../../Commands", { noCache: true }), ...requireDir("../../AdminCommands", { noCache: true }) };

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
        for (let command of this.commands) {
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
        }
    }

    reloadCommands(): void {
        this.commands = [];
        this.loadNormalCommands();
    }

    reloadDevCommands(): void {
        this.devCommands = this.devCommands.filter(command => !command.reloadable);
        this.loadDevCommands(true);
    }

    loadDevCommands(reloading = false): void {
        //@ts-ignore 2345
        let dirs = requireDir("../../DevCommands", { noCache: true });

        for (let name in dirs) {
            let command = dirs[name].getInstance();
            if (reloading && !command.reloadable) continue;
            if (command.shortcut) {
                let sCommand = dirs[name].getInstance();
                sCommand.name = sCommand.shortcut;
                this.devCommands.push(sCommand);
            }
            this.devCommands.push(command);
        }

        for (let command of this.devCommands) {
            client.guilds.cache.get(process.env.GUILD_ID as string)?.commands.create({
                name: command.name,
                description: command.description,
                //@ts-ignore 2322
                options: command.options
            });
        }
    }

    deleteDevCache(): void {
        client.guilds.cache.get(process.env.GUILD_ID as string)?.commands.cache.forEach(command => {
            if (this.getCommandByName(command.name)?.reloadable) {
                command.delete();
            }
        });
    }
}
