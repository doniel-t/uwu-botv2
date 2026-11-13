import DiscordJS, { ApplicationCommandOptionType } from "discord.js";
import { EPHEMERAL, optBoolean, optChannelId, optInteger, optString, optUser, subcommand } from "../utils/LLM/v2/compat";

import { NormalCommandClass } from "../utils/Commands/NormalCommand/NormalCommand";
import { addNickname, listNicknames, removeNickname } from "../utils/LLM/v2/nicknames";
import { canManageGuild } from "../utils/LLM/v2/permissions";

class Nickname extends NormalCommandClass {
  name = "nickname";
  description = "Teach the bot which names refer to which user";
  options = [
    {
      name: "add",
      description: "Add a nickname for a user",
      required: false,
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: "user", description: "The user (pick them or paste their ID)", required: true, type: ApplicationCommandOptionType.User },
        { name: "name", description: "The nickname, 2-32 characters", required: true, type: ApplicationCommandOptionType.String },
      ],
    },
    {
      name: "remove",
      description: "Remove a nickname (the user themself or Manage Server)",
      required: false,
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: "user", description: "The user", required: true, type: ApplicationCommandOptionType.User },
        { name: "name", description: "The nickname to remove", required: true, type: ApplicationCommandOptionType.String },
      ],
    },
    {
      name: "list",
      description: "List nicknames",
      required: false,
      type: ApplicationCommandOptionType.Subcommand,
      options: [{ name: "user", description: "Only this user", required: false, type: ApplicationCommandOptionType.User }],
    },
  ];

  reply(interaction: DiscordJS.ChatInputCommandInteraction): void {
    if (!interaction.guildId) {
      interaction.reply({ content: "This command only works in a server." });
      return;
    }
    const guildId = interaction.guildId;
    const ephemeral = EPHEMERAL;
    const noPings = { allowedMentions: { parse: [] as never[] } };

    switch (subcommand(interaction)) {
      case "add": {
        const user = optUser(interaction, "user")!;
        const name = optString(interaction, "name")!;
        if (user.bot) {
          interaction.reply({ content: "Bots don't get nicknames.", ...ephemeral });
          return;
        }
        const res = addNickname(guildId, user.id, name, interaction.user.id);
        if ("error" in res) {
          interaction.reply({ content: res.error, ...ephemeral, ...noPings });
          return;
        }
        interaction.reply({
          content: `Got it: **${name.trim()}** means <@${user.id}>.${res.warning ? `\n-# ${res.warning}` : ""}`,
          ...ephemeral,
          ...noPings,
        });
        return;
      }
      case "remove": {
        const user = optUser(interaction, "user")!;
        const name = optString(interaction, "name")!;
        if (user.id !== interaction.user.id && !canManageGuild(interaction)) {
          interaction.reply({ content: "Only that user or someone with Manage Server can remove their nicknames.", ...ephemeral });
          return;
        }
        const removed = removeNickname(guildId, user.id, name);
        interaction.reply({
          content: removed ? `Removed **${name.trim()}** from <@${user.id}>.` : `<@${user.id}> has no nickname "${name.trim()}".`,
          ...ephemeral,
          ...noPings,
        });
        return;
      }
      case "list": {
        const user = optUser(interaction, "user");
        const rows = listNicknames(guildId, user?.id);
        if (rows.length === 0) {
          interaction.reply({ content: user ? `<@${user.id}> has no nicknames.` : "No nicknames yet. Add one with `/nickname add`.", ...noPings });
          return;
        }
        const byUser = new Map<string, string[]>();
        for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r.nickname]);
        let content = [...byUser].map(([id, names]) => `<@${id}>: ${names.join(", ")}`).join("\n");
        if (content.length > 1950) content = content.slice(0, 1940) + "\n…";
        interaction.reply({ content, ...noPings });
        return;
      }
      default:
        interaction.reply({ content: "Unknown subcommand.", ...ephemeral });
    }
  }
}

export function getInstance() {
  return new Nickname();
}
