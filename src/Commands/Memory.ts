import DiscordJS, { ApplicationCommandOptionType } from "discord.js";
import { EPHEMERAL, optBoolean, optChannelId, optInteger, optString, optUser, subcommand } from "../utils/LLM/v2/compat";

import { NormalCommandClass } from "../utils/Commands/NormalCommand/NormalCommand";
import { addManualFact, FACT_CATEGORIES, forgetAllAbout, forgetFact, getActiveFacts, getFact, getFactSources } from "../utils/LLM/v2/facts";
import { setUserLearning, userAllowsLearning } from "../utils/LLM/v2/settings";
import { BACKFILL_OWNER_ID } from "../utils/LLM/v2/backfill";
import { sendProfileForEditing } from "../utils/LLM/v2/profileEdit";
import { deleteProfile, getProfile, markProfileDirty, regenerateProfile } from "../utils/LLM/v2/profiles";
import { canManageGuild } from "../utils/LLM/v2/permissions";

class Memory extends NormalCommandClass {
  name = "memory";
  description = "See, add or delete what the bot has learned about people";
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
      name: "add",
      description: "Teach the bot a fact about someone (yourself; others need Manage Server)",
      required: false,
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        { name: "user", description: "Who the fact is about", required: true, type: ApplicationCommandOptionType.User },
        {
          name: "category",
          description: "What kind of fact it is",
          required: true,
          type: ApplicationCommandOptionType.String,
          choices: FACT_CATEGORIES.map((c) => ({ name: c.replace(/_/g, " "), value: c })),
        },
        { name: "fact", description: 'The fact, e.g. "mains Yasuo" or "hardstuck silver in Valorant"', required: true, type: ApplicationCommandOptionType.String, max_length: 200 },
        {
          name: "predicate",
          description: "Optional exact predicate (e.g. mains_champion); default depends on the category",
          required: false,
          type: ApplicationCommandOptionType.String,
          max_length: 40,
        },
      ],
    },
    {
      name: "editprofile",
      description: "Owner only: get a profile by DM and reply there with the replacement",
      required: false,
      type: ApplicationCommandOptionType.Subcommand,
      options: [{ name: "user", description: "Whose profile to edit", required: true, type: ApplicationCommandOptionType.User }],
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
            f.kind === "curated_seed"
              ? `added by hand${f.reporters.length ? ` by ${f.reporters.map((r) => `<@${r}>`).join(", ")}` : ""}`
              : f.kind === "self_report" || f.kind === "temporary_state"
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
      case "add": {
        const user = optUser(interaction, "user")!;
        if (user.bot) {
          interaction.reply({ content: "Bots don't get memories.", ...ephemeral });
          return;
        }
        const isOwner = interaction.user.id === BACKFILL_OWNER_ID;
        if (user.id !== interaction.user.id && !isOwner && !canManageGuild(interaction)) {
          interaction.reply({ content: "You can only add facts about yourself.", ...ephemeral });
          return;
        }
        if (!userAllowsLearning(guildId, user.id)) {
          interaction.reply({ content: `<@${user.id}> turned learning off, so I won't store facts about them.`, allowedMentions: { parse: [] }, ...ephemeral });
          return;
        }
        const res = addManualFact(guildId, {
          subjectUserId: user.id,
          category: optString(interaction, "category")!,
          value: optString(interaction, "fact")!,
          predicate: optString(interaction, "predicate"),
          addedBy: interaction.user.id,
          addedByName: interaction.user.username,
        });
        if (!res.ok) {
          interaction.reply({ content: res.reason, ...ephemeral });
          return;
        }
        markProfileDirty(guildId, user.id);
        const f = res.fact;
        interaction.reply({
          content: `${res.existed ? "Already knew that; marked it as hand-confirmed" : "Remembered"}: \`#${f.id}\` <@${user.id}> · ${f.category} · ${f.predicate.replace(/_/g, " ")}: ${f.value}`,
          allowedMentions: { parse: [] },
          ...ephemeral,
        });
        return;
      }
      case "editprofile": {
        if (interaction.user.id !== BACKFILL_OWNER_ID) {
          interaction.reply({ content: "Only the bot owner can edit profiles.", ...ephemeral });
          return;
        }
        const user = optUser(interaction, "user")!;
        const member = interaction.guild?.members.cache.get(user.id);
        const name = member?.displayName ?? user.username;
        try {
          await sendProfileForEditing(interaction.user, guildId, user.id, name);
        } catch (err) {
          interaction.reply({ content: `Couldn't DM you (are DMs from server members off?): ${(err as Error).message}`, ...ephemeral });
          return;
        }
        interaction.reply({ content: `Sent you the profile of ${name} by DM. Reply there with the new version.`, allowedMentions: { parse: [] }, ...ephemeral });
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
