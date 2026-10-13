import { Colors, EmbedBuilder, GuildBan } from "discord.js";
import { sendLog } from "../utils/logger.js";
import { addActivity } from "../utils/activityTracker.js";

export async function handleGuildBanAdd(ban: GuildBan): Promise<void> {
  addActivity({
    guildId: ban.guild.id,
    type: "bot",
    title: "Üye Yasaklandı (Ban)",
    desc: `${ban.user.tag} sunucudan yasaklandı`,
    icon: "gavel",
    color: "#ef4444",
  });

  const embed = new EmbedBuilder()
    .setColor(Colors.Red)
    .setTitle("🔨 Üye Sunucudan Yasaklandı (Ban)")
    .setThumbnail(ban.user.displayAvatarURL())
    .addFields(
      { name: "Kullanıcı", value: `<@${ban.user.id}> (${ban.user.tag})`, inline: true },
      { name: "Kullanıcı ID", value: `\`${ban.user.id}\``, inline: true }
    )
    .setTimestamp();

  if (ban.reason) {
    embed.addFields({ name: "Sebep", value: ban.reason, inline: false });
  }

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
        title: "Üye Yasaklandı",
        description: `${ban.user.tag} sunucudan yasaklandı. Sebep: ${ban.reason || "Belirtilmedi"}`,
        details: { reason: ban.reason || "Belirtilmedi" },
        color: "#ef4444",
      },
    }
  );
}
