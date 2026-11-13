import DiscordJS, { ApplicationCommandOptionType } from "discord.js";
import { EPHEMERAL, optBoolean, optChannelId, optInteger, optString, optUser, subcommand } from "../utils/LLM/v2/compat";

import { NormalCommandClass } from "../utils/Commands/NormalCommand/NormalCommand";
import { forgetAllAbout, forgetFact, getActiveFacts, getFact, getFactSources } from "../utils/LLM/v2/facts";
import { setUserLearning } from "../utils/LLM/v2/settings";
import { deleteProfile, getProfile, markProfileDirty, regenerateProfile } from "../utils/LLM/v2/profiles";
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
      name: "profile",
      description: "Show the bot's profile of a user (yourself by default; others need Manage Server)",
      required: false,
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: "user", description: "Whose profile to show", required: false, type: ApplicationCommandOptionType.User },
        { name: "refresh", description: "Rewrite it now from the latest facts", required: false, type: ApplicationCommandOptionType.Boolean },
      ],
    },
    {
      name: "source",
      description: "Show the message(s) a fact was learned from",
      required: false,
      type: ApplicationCommandOptionType.Subcommand,
      options: [{ name: "fact", description: "Fact id from /memory show", required: true, type: ApplicationCommandOptionType.Integer }],
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

  async reply(interaction: DiscordJS.ChatInputCommandInteraction): Promise<void> {
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
      case "profile": {
        const user = optUser(interaction, "user") ?? interaction.user;
        if (user.id !== interaction.user.id && !canManageGuild(interaction)) {
          interaction.reply({ content: "You can only view your own profile.", ...ephemeral });
          return;
        }
        let profile = getProfile(guildId, user.id);
        if (optBoolean(interaction, "refresh")) {
          await interaction.deferReply(ephemeral);
          try {
            profile = (await regenerateProfile(guildId, user.id)) ?? profile;
          } catch (err) {
            await interaction.editReply({ content: `Couldn't rewrite the profile: ${(err as Error).message}` });
            return;
          }
          await interaction.editReply({
            content: profile
              ? `**Profile of <@${user.id}>** \n${profile.profile}`.slice(0, 1990)
              : `Not enough known about <@${user.id}> yet for a profile.`,
            allowedMentions: { parse: [] },
          } as any);
          return;
        }
        interaction.reply({
          content: profile
            ? `**Profile of <@${user.id}>** \n${profile.profile}`.slice(0, 1990)
            : `No profile of <@${user.id}> yet. It's written once I've learned a few facts (or use \`refresh:true\`).`,
          allowedMentions: { parse: [] },
          ...ephemeral,
        });
        return;
      }
      case "source": {
        const id = optInteger(interaction, "fact")!;
        const fact = getFact(guildId, id);
        if (!fact) {
          interaction.reply({ content: `No fact #${id} here.`, ...ephemeral });
          return;
        }
        const sources = getFactSources(guildId, id);
        const lines = sources.map((src) => `> ${src.quote}\n${src.link ?? "(message no longer stored)"}`);
        interaction.reply({
          content: `**#${id}** ${fact.predicate.replace(/_/g, " ")}: ${fact.value}\n${lines.join("\n") || "No source message stored."}`.slice(0, 1990),
          allowedMentions: { parse: [] },
          ...ephemeral,
        });
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
        markProfileDirty(guildId, fact.subjectUserId);
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
          deleteProfile(guildId, interaction.user.id);
          interaction.reply({ content: `Stopped learning about you and deleted ${n} fact(s) and your profile.`, ...ephemeral });
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
