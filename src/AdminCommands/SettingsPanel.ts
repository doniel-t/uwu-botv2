import DiscordJS, { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { GuildSettings, GuildSettingsTypes } from '../utils/Settings/GuildSettings';
import { settingsHandler } from '../index';
import { AdminCommandClass } from '../utils/Commands/AdminCommand/AdminCommand';
import { isAdmin } from '../utils/Admin';
import { GuildSetting } from 'src/utils/Settings/GuildSetting';

class SettingsPanel extends AdminCommandClass {
    name = "settings";
    description = "Opens the settings panel";
    reply(interaction: DiscordJS.CommandInteraction): void {
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

function createButtons(settings: GuildSettings): ActionRowBuilder<ButtonBuilder> {
    let builder = new ActionRowBuilder<ButtonBuilder>();

    for (let type of Object.values(GuildSettingsTypes)) {
        //@ts-ignore 2345
        let setting = settings.get(type);
        if (setting == undefined) continue;
        builder.addComponents(new ButtonBuilder().setCustomId("settingsPanel_" + setting.name).setLabel(setting.friendlyName).setStyle(ButtonStyle.Primary));
    }

    return builder;
}

function createCollector(interaction: DiscordJS.CommandInteraction, settings: GuildSettings): void {
    const filter = (i: DiscordJS.MessageComponentInteraction) => i.customId.startsWith("settingsPanel_") && isAdmin(i);

    const collector = interaction.channel?.createMessageComponentCollector({ filter, time: time_out });

    if (collector === undefined) {
        throw new Error("collector is undefined");
    }
    async function handleSettingChange(interaction: DiscordJS.MessageComponentInteraction): Promise<boolean> {
        let name = interaction.customId.slice(14);
        for (let type of Object.values(GuildSettingsTypes)) {
            //@ts-ignore 2345
            let setting = settings.get(type);
            if (setting == undefined) continue;
            if (setting.name == name) {

                //@ts-ignore 2345
                if (settingsHandler.set(interaction.guildId, type, await getValue(interaction, setting))) {

                    let newSettings = settingsHandler.getAllSettings(interaction.guildId);
                    if (newSettings === undefined) return false;
                    settings = newSettings;
                    return true;
                } else {
                    return false;
                }
            }
        }
        return false;
    }
    collector.on('collect', async i => {
        if (i.guildId == null) return;
        await i.deferUpdate();
        if (await handleSettingChange(i)) {
            i.editReply({ content: getMessage(settings) });
        } else {
            i.editReply({ content: 'Failed to update the settings' });
            collector.stop();
        }
    });
}

function getMessage(settings: GuildSettings): string {
    let message = "**SettingsPanel**\n";
    for (let type of Object.values(GuildSettingsTypes)) {
        //@ts-ignore 2345
        let setting = settings.get(type);
        if (setting == undefined) continue;
        message += `${setting.friendlyName}: ${setting.value}\n`;
    }

    return message;
}

async function getValue(interaction: DiscordJS.MessageComponentInteraction, setting: GuildSetting) {
    switch (setting.type) {
        case Boolean:
            return Promise.resolve(!(setting.value as boolean));
        case String:
            return await getValueFromDMs(await interaction.user.createDM(), setting);
        case Number:
            let number = Number(await getValueFromDMs(await interaction.user.createDM(), setting))
            return !isNaN(number) ? number : setting.value;
        default:
            throw new Error("Invalid setting type");
    }
}

async function getValueFromDMs(dms: DiscordJS.DMChannel, setting: GuildSetting): Promise<string | number | boolean> {
    return dms.send(`Please write the new value for ${setting.friendlyName}`).then(() => {
        return dms.awaitMessages({ max: 1, time: time_out }).then(async ms => {
            let message = ms.first();
            if (message === undefined) {
                return Promise.resolve(setting.value);
            }
            return Promise.resolve(message.content);
        });
    });
}