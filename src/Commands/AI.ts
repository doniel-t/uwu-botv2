import DiscordJS, { ApplicationCommandOptionType } from "discord.js";
import { EPHEMERAL, optBoolean, optChannelId, optInteger, optString, optUser, subcommand } from "../utils/LLM/v2/compat";

import { NormalCommandClass } from "../utils/Commands/NormalCommand/NormalCommand";
import { getAISettings, MODELS, updateAISettings } from "../utils/LLM/v2/settings";
import { pendingResponses } from "../utils/LLM/v2/engine";
import { canManageGuild } from "../utils/LLM/v2/permissions";
import { CHAT_MODEL } from "../utils/LLM/utils/api/openrouter";

class AI extends NormalCommandClass {
  name = "aiconfig";
  description = "Configure the AI reply engine";
  options = [
    {
      name: "engine",
      description: "Switch between the legacy engine and the new memory engine (Manage Server)",
      required: false,
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "mode",
          description: "legacy = old prompts/RAG, memory = learned facts, nicknames, tools",
          required: true,
          type: ApplicationCommandOptionType.String,
          choices: [
            { name: "legacy", value: "legacy" },
            { name: "memory", value: "memory" },
          ],
        },
      ],
    },
    {
      name: "web",
      description: "Allow the memory engine to search the web (Manage Server)",
      required: false,
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "mode",
          description: "auto = search when needed, off = never",
          required: true,
          type: ApplicationCommandOptionType.String,
          choices: [
            { name: "auto", value: "auto" },
            { name: "off", value: "off" },
          ],
        },
      ],
    },
    {
      name: "learning",
      description: "Let the memory engine learn facts from chat in this server (Manage Server)",
      required: false,
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "enabled",
          description: "true to learn, false to pause learning",
          required: true,
          type: ApplicationCommandOptionType.Boolean,
        },
      ],
    },
    {
      name: "status",
      description: "Show the current AI engine settings",
      required: false,
      type: ApplicationCommandOptionType.Subcommand,
    },
  ];

  reply(interaction: DiscordJS.ChatInputCommandInteraction): void {
    if (!interaction.guildId) {
      interaction.reply({ content: "This command only works in a server." });
      return;
    }
    const guildId = interaction.guildId;
    const sub = subcommand(interaction);

    if (sub === "status") {
      const s = getAISettings(guildId);
      const lines = [
        `**Engine:** ${s.engine}`,
        s.engine === "memory"
          ? `**Model:** ${MODELS.chat} · extractor ${MODELS.extract} · search ${MODELS.search}`
          : `**Model:** ${CHAT_MODEL}`,
        `**Web search:** ${s.webMode}${s.engine === "legacy" ? " (memory engine only)" : ""}`,
        `**Learning:** ${s.learning ? "on" : "paused"}${s.engine === "legacy" ? " (memory engine only)" : ""}`,
        `**Pending replies:** ${pendingResponses()}`,
      ];
      interaction.reply({ content: lines.join("\n"), ...EPHEMERAL });
      return;
    }

    if (!canManageGuild(interaction)) {
      interaction.reply({ content: "You need the Manage Server permission for that.", ...EPHEMERAL });
      return;
    }

    switch (sub) {
      case "engine": {
        const mode = optString(interaction, "mode")! === "memory" ? "memory" : "legacy";
        updateAISettings(guildId, { engine: mode }, interaction.user.id);
        interaction.reply({
          content:
            mode === "memory"
              ? "Switched to the **memory** engine. I'll start keeping track of who said what, learn facts from chat, and use nicknames. `/aiconfig engine mode:legacy` switches back; nothing is deleted."
              : "Switched back to the **legacy** engine. Memory-engine data is kept, and learning is paused until you switch again.",
        });
        return;
      }
      case "web": {
        const mode = optString(interaction, "mode")! === "off" ? "off" : "auto";
        updateAISettings(guildId, { webMode: mode }, interaction.user.id);
        interaction.reply({ content: `Web search is now **${mode}**.` });
        return;
      }
      case "learning": {
        const enabled = optBoolean(interaction, "enabled")!;
        updateAISettings(guildId, { learning: enabled }, interaction.user.id);
        interaction.reply({ content: enabled ? "Learning is **on**." : "Learning is **paused**. Existing memories are kept." });
        return;
      }
      default:
        interaction.reply({ content: "Unknown subcommand.", ...EPHEMERAL });
    }
  }
}

export function getInstance() {
  return new AI();
}
