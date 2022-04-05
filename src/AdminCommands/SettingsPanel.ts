import DiscordJS, { MessageActionRow, MessageButton } from 'discord.js';
import { GuildSettingsTypes } from '../utils/GuildSettings';
import { settingsHandler } from '../index';
import { AdminCommandClass } from '../utils/AdminCommand/AdminCommand';
import { isAdmin } from '../utils/Admin';

class SettingsPanel extends AdminCommandClass {
    name = "settings";
    description = "Opens the settings panel";
    reply(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>): void {
        if (interaction.guild === null) {
            interaction.reply("This command can only be used in a guild.");
            return;
        }
        let settings = settingsHandler.getAllSettings(interaction.guildId);
        if (settings === undefined) {
            interaction.reply("This guild has no settings.");
            return;
        }

        let buttons = createButtons(settings);

        createCollector(interaction, settings);

        interaction.reply({ content: getMessage(settings), components: [buttons] }).then(() => {
            setTimeout(() => {
                interaction.deleteReply();
            }, time_out);
        });
    }
}

export function getInstance() { return new SettingsPanel() };

const time_out = 60_000;

function createButtons(settings: { [key: string]: boolean | string | number }): MessageActionRow {
    let buttons = new MessageActionRow();

    for (let setting in settings) {
        buttons.addComponents(new MessageButton().setCustomId("settingsPanel_" + setting).setLabel(setting).setStyle("PRIMARY"));
    }

    return buttons;
}

function createCollector(interaction: DiscordJS.CommandInteraction<DiscordJS.CacheType>, settings: { [key: string]: boolean | string | number }): void {
    const filter = (i: DiscordJS.MessageComponentInteraction<DiscordJS.CacheType>) => i.customId.startsWith("settingsPanel_") && isAdmin(i);

    const collector = interaction.channel?.createMessageComponentCollector({ filter, time: time_out });

    if (collector === undefined) {
        throw new Error("collector is undefined");
    }

    collector.on('collect', async i => {
        if (settings[i.customId.slice(14)] !== undefined) {

            if (settingsHandler.set(i.guildId,
                i.customId.slice(14) as GuildSettingsTypes,
                !settings[i.customId.slice(14)])) {

                settings = settingsHandler.getAllSettings(i.guildId) ?? {};
                i.update({ content: getMessage(settings) });
            } else {
                i.update({ content: 'Failed to update the settings' });
                collector.stop();
            }
        }
    });
}

function getMessage(settings: { [key: string]: boolean | string | number }): string {
    let message = "**SettingsPanel**\n";
    for (let setting in settings) {
        message += `${setting}: ${settings[setting]}\n`;
    }
    return message;
}