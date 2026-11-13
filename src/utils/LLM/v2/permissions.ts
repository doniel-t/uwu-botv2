import { BaseInteraction, GuildMember, PermissionFlagsBits } from "discord.js";
import { isAdmin } from "../../Admin";

/** Manage Server, Administrator, or a bot dev. Checked at execution time. */
export function canManageGuild(interaction: BaseInteraction): boolean {
  if (isAdmin(interaction)) return true;
  const member = interaction.member as GuildMember | null;
  return !!member?.permissions?.has?.(PermissionFlagsBits.ManageGuild);
}
