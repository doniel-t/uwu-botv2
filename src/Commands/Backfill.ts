import DiscordJS, { ApplicationCommandOptionType } from "discord.js";
import { EPHEMERAL, optBoolean, optChannelId, optInteger, optString, optUser, subcommand } from "../utils/LLM/v2/compat";

import { NormalCommandClass } from "../utils/Commands/NormalCommand/NormalCommand";
import { BACKFILL_OWNER_ID, parseSince, startBackfill } from "../utils/LLM/v2/backfill";

class Backfill extends NormalCommandClass {
  name = "backfill";
  description = "Learn facts from older chat history (bot owner only)";
  options = [
    {
      name: "since",
      description: "Start date (YYYY-MM-DD) or a number of days, e.g. 90d",
      required: true,
      type: ApplicationCommandOptionType.String,
    },
    {
      name: "channel",
      description: "Only this channel (default: every channel the bot can read)",
      required: false,
      type: ApplicationCommandOptionType.Channel,
    },
    {
      name: "reset",
      description: "DELETE all learned facts and profiles here first, then re-learn (asks in DM)",
      required: false,
      type: ApplicationCommandOptionType.Boolean,
    },
    {
      name: "images",
      description: "Also describe old images (costs more, default false)",
      required: false,
      type: ApplicationCommandOptionType.Boolean,
    },
  ];

  async reply(interaction: DiscordJS.ChatInputCommandInteraction): Promise<void> {
    console.log(`[Backfill] /backfill by ${interaction.user.id} in guild ${interaction.guildId}`);
    // Acknowledge first: Discord shows "did not respond" after 3 seconds.
    try {
      await interaction.deferReply(EPHEMERAL);
    } catch (err) {
      console.error("[Backfill] Could not acknowledge the command:", err);
      return;
    }
    const answer = (content: string) =>
      interaction.editReply({ content }).catch((err) => console.error("[Backfill] Could not edit reply:", err));

    try {
      if (interaction.user.id !== BACKFILL_OWNER_ID) {
        await answer("Only the bot owner can run backfills.");
        return;
      }
      if (!interaction.guild) {
        await answer("Run this in the server you want to backfill.");
        return;
      }

      const raw = optString(interaction, "since") ?? "";
      const since = parseSince(raw);
      if (since == null) {
        await answer(`Couldn't read "${raw}". Use a date like 2026-08-01 or days like 90d.`);
        return;
      }
      if (since >= Date.now()) {
        await answer("That date is in the future.");
        return;
      }

      await answer("Scanning history. I'll DM you the cost estimate to confirm.");
      const res = await startBackfill({
        client: interaction.client,
        guild: interaction.guild,
        ownerId: interaction.user.id,
        since,
        channelId: optChannelId(interaction, "channel") ?? undefined,
        includeImages: optBoolean(interaction, "images") ?? false,
        reset: optBoolean(interaction, "reset") ?? false,
      });
      if ("error" in res) await answer(res.error);
    } catch (err) {
      console.error("[Backfill] Failed:", err);
      await answer(`Backfill failed: ${(err as Error)?.message ?? err}`);
    }
  }
}

export function getInstance() {
  return new Backfill();
}
