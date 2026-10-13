import { Colors, EmbedBuilder, GuildBan } from "discord.js";
import { sendLog } from "../utils/logger.js";
import { addActivity } from "../utils/activityTracker.js";

export async function handleGuildBanRemove(ban: GuildBan): Promise<void> {
  addActivity({
    guildId: ban.guild.id,
    type: "bot",
    title: "Yasak Kaldırıldı (Unban)",
    desc: `${ban.user.tag} yasağı kaldırıldı`,
    icon: "lock-open",
    color: "#22c55e",
  });

  const embed = new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle("🔓 Üyenin Yasağı Kaldırıldı (Unban)")
    .setThumbnail(ban.user.displayAvatarURL())
    .addFields(
      { name: "Kullanıcı", value: `<@${ban.user.id}> (${ban.user.tag})`, inline: true },
      { name: "Kullanıcı ID", value: `\`${ban.user.id}\``, inline: true }
    )
    .setTimestamp();

  await sendLog(
    ban.guild,
    embed,
    {
      category: "moderation",
      eventType: "guildBan",
      user: {
        id: ban.user.id,
        tag: ban.user.tag,
        avatarUrl: ban.user.displayAvatarURL(),
        isBot: ban.user.bot,
      },
      record: {
        title: "Yasak Kaldırıldı",
        description: `${ban.user.tag} sunucu yasağı kaldırıldı`,
        color: "#22c55e",
      },
    }
  );
}
