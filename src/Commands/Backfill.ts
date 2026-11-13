import DiscordJS, { ApplicationCommandOptionType, MessageFlags } from "discord.js";
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
      name: "images",
      description: "Also describe old images (costs more, default false)",
      required: false,
      type: ApplicationCommandOptionType.Boolean,
    },
  ];

  async reply(interaction: DiscordJS.ChatInputCommandInteraction): Promise<void> {
    const ephemeral = { flags: MessageFlags.Ephemeral } as const;
    if (interaction.user.id !== BACKFILL_OWNER_ID) {
      await interaction.reply({ content: "Only the bot owner can run backfills.", ...ephemeral });
      return;
    }
    if (!interaction.guild) {
      await interaction.reply({ content: "Run this in the server you want to backfill.", ...ephemeral });
      return;
    }

    const raw = interaction.options.getString("since", true);
    const since = parseSince(raw);
    if (since == null) {
      await interaction.reply({ content: `Couldn't read "${raw}". Use a date like 2026-08-01 or days like 90d.`, ...ephemeral });
      return;
    }
    if (since >= Date.now()) {
      await interaction.reply({ content: "That date is in the future.", ...ephemeral });
      return;
    }

    await interaction.reply({ content: "Scanning history. I'll DM you the cost estimate to confirm.", ...ephemeral });
    const res = await startBackfill({
      client: interaction.client,
      guild: interaction.guild,
      ownerId: interaction.user.id,
      since,
      channelId: interaction.options.getChannel("channel")?.id,
      includeImages: interaction.options.getBoolean("images") ?? false,
    });
    if ("error" in res) await interaction.editReply({ content: res.error });
  }
}

export function getInstance() {
  return new Backfill();
}
