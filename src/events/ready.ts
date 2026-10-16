import { ActivityType, Client, Colors, EmbedBuilder } from "discord.js";
import { auditLoggerService, type IAuditLogger } from "../services/logging/AuditLoggerService.js";

export function handleReady(client: Client, logger: IAuditLogger = auditLoggerService): void {
  console.log(`✅ [Giriş Başarılı] ${client.user?.tag} aktif!`);
  console.log(`📊 Bağlı Sunucu Sayısı: ${client.guilds.cache.size}`);

  client.user?.setPresence({
    activities: [{ name: "Sunucu Hareketlerini & #bot-logs", type: ActivityType.Watching }],
    status: "online",
  });

  const readyEmbed = new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle("🟢 Bot Başlatıldı")
    .setDescription("Özel Loglama Botu aktif edildi ve sunucu hareketleri izleniyor.")
    .addFields(
      { name: "Bot", value: `${client.user?.tag} (\`${client.user?.id}\`)`, inline: true },
      { name: "Sunucu Sayısı", value: `${client.guilds.cache.size}`, inline: true }
    )
    .setTimestamp();

  void logger.sendLog(client, readyEmbed);
}
