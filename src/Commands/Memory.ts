import DiscordJS, { ApplicationCommandOptionType } from "discord.js";
import { EPHEMERAL, optBoolean, optChannelId, optInteger, optString, optUser, subcommand } from "../utils/LLM/v2/compat";

import { NormalCommandClass } from "../utils/Commands/NormalCommand/NormalCommand";
import { forgetAllAbout, forgetFact, getActiveFacts, getFact } from "../utils/LLM/v2/facts";
import { setUserLearning } from "../utils/LLM/v2/settings";
import { canManageGuild } from "../utils/LLM/v2/permissions";

class Memory extends NormalCommandClass {
  name = "memory";
  description = "See or delete what the bot has learned about you";
  options = [
    {
      name: "show",
      description: "Show learned facts (yourself by default; others need Manage Server)",
      required: false,
      type: ApplicationCommandOptionType.Subcommand,
      options: [{ name: "user", description: "Whose memories to show", required: false, type: ApplicationCommandOptionType.User }],
    },
    {
      name: "forget",
      description: "Delete one learned fact by its id",
      required: false,
      type: ApplicationCommandOptionType.Subcommand,
      options: [{ name: "fact", description: "Fact id from /memory show", required: true, type: ApplicationCommandOptionType.Integer }],
    },
    {
      name: "learning",
      description: "Allow or stop the bot learning facts about you",
      required: false,
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "enabled",
          description: "false stops learning about you and deletes what was learned",
          required: true,
          type: ApplicationCommandOptionType.Boolean,
        },
      ],
    },
  ];

  reply(interaction: DiscordJS.ChatInputCommandInteraction): void {
    if (!interaction.guildId) {
      interaction.reply({ content: "This command only works in a server." });
      return;
    }
    const guildId = interaction.guildId;
    const ephemeral = EPHEMERAL;

    switch (subcommand(interaction)) {
      case "show": {
        const user = optUser(interaction, "user") ?? interaction.user;
        if (user.id !== interaction.user.id && !canManageGuild(interaction)) {
          interaction.reply({ content: "You can only view your own memories.", ...ephemeral });
          return;
        }
        const facts = getActiveFacts(guildId, [user.id]);
        if (facts.length === 0) {
          interaction.reply({ content: `I don't remember anything about <@${user.id}> yet.`, ...ephemeral });
          return;
        }
        const lines = facts.slice(0, 40).map((f) => {
          const src =
            f.kind === "self_report" || f.kind === "temporary_state"
              ? f.kind === "temporary_state"
                ? "temporary"
                : "self"
              : `from ${f.reporters.map((r) => `<@${r}>`).join(", ") || f.kind}`;
          return `\`#${f.id}\` ${f.predicate.replace(/_/g, " ")}: ${f.value} · ${src}`;
        });
        let content = `**What I remember about <@${user.id}>** (${facts.length})\n${lines.join("\n")}`;
        if (content.length > 1950) content = content.slice(0, 1940) + "\n…";
        interaction.reply({ content, allowedMentions: { parse: [] }, ...ephemeral });
        return;
      }
      case "forget": {
        const id = optInteger(interaction, "fact")!;
        const fact = getFact(guildId, id);
        if (!fact) {
          interaction.reply({ content: `No fact #${id} here.`, ...ephemeral });
          return;
        }
        const own = fact.subjectUserId === interaction.user.id;
        if (!own && !canManageGuild(interaction)) {
          interaction.reply({ content: "You can only delete facts about yourself.", ...ephemeral });
          return;
        }
        forgetFact(guildId, id);
        interaction.reply({ content: `Forgot #${id} (${fact.predicate.replace(/_/g, " ")}: ${fact.value}).`, ...ephemeral });
        return;
      }
      case "learning": {
        const enabled = optBoolean(interaction, "enabled")!;
        setUserLearning(guildId, interaction.user.id, enabled);
        if (enabled) {
          interaction.reply({ content: "Okay, I'll learn things about you again.", ...ephemeral });
        } else {
          const n = forgetAllAbout(guildId, interaction.user.id);
          interaction.reply({ content: `Stopped learning about you and deleted ${n} fact(s).`, ...ephemeral });
        }
        return;
      }
      default:
        interaction.reply({ content: "Unknown subcommand.", ...ephemeral });
    }
  }
}

export function getInstance() {
  return new Memory();
}
