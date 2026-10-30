import { ChannelType, Colors, EmbedBuilder, Guild, PermissionFlagsBits } from "discord.js";
import { activityRepository, type IActivityRepository } from "../repositories/activityRepository.js";
import { activityTrackerService } from "../services/activity/ActivityTrackerService.js";
import { getGuildSettings } from "../settings.js";

/**
 * Bot yeni bir Discord sunucusuna davet edilip eklendiğinde tetiklenir (GuildCreate).
 * - Sunucunun varsayılan ayarlarını oluşturur.
 * - Aktivite ve istatistik geçmişini besler.
 * - Sunucuya veya sunucu sahibine kurulum rehberi mesajı iletir.
 */
export async function handleGuildCreate(
  guild: Guild,
  activityRepo: IActivityRepository = activityRepository
): Promise<void> {
  console.log(`[Sunucu Eklendi] 🎉 Bot yeni bir sunucuya katıldı: ${guild.name} (${guild.id}) - ${guild.memberCount} üye`);

  // 1. Aktivite kaydı ekle
  activityRepo.add({
    guildId: guild.id,
    type: "bot",
    title: "Yeni Sunucuya Eklendi 🎉",
    desc: `Bot, ${guild.name} (${guild.memberCount} üye) sunucusuna başarıyla katıldı`,
    icon: "server",
    color: "#FFE000",
  });

  // 2. Sunucu ayarlarını başlat (varsayılan konfigürasyon)
  try {
    getGuildSettings(guild.id);
  } catch (err) {
    console.warn(`[Sunucu Eklendi] ${guild.name} için ayarlar başlatılırken uyarı:`, err);
  }

  // 3. Aktivite servisini besle
  try {
    activityTrackerService.seedFromGuildHistory(guild.client, guild.id);
  } catch (err) {
    console.warn(`[Sunucu Eklendi] ${guild.name} için aktivite verisi beslenirken uyarı:`, err);
  }

  // 4. Sunucuya karşılama & kurulum embedi gönder
  try {
    const welcomeEmbed = new EmbedBuilder()
      .setColor("#FFE000" as any)
      .setTitle("🤖 SyncBot Sunucunuza Başarıyla Eklendi!")
      .setDescription(
        `Merhaba **${guild.name}** topluluğu! SyncBot; modern karşılama kartları, çok kanallı denetim kayıtları, ana sayfa akışı, Steam güncellemeleri ve ayrıntılı aktiflik analitiği ile sunucunuzu güçlendirmek için hazır.`
      )
      .addFields(
        {
          name: "🌐 Web Yönetim Paneli",
          value: "Sunucunuzun tüm ayarlarını tarayıcınızdan canlı olarak yönetebilirsiniz:\n👉 `http://127.0.0.1:3000`",
          inline: false,
        },
        {
          name: "🛠️ Hızlı Kurulum Adımları",
          value:
            "1. **Yönetim Paneline** girip sunucunuzu seçin.\n" +
            "2. **Karşılama Kartı** sekmesinden kanalı ve görsel katmanları özelleştirin.\n" +
            "3. **Genel Ayarlar** sekmesinden denetim (audit log) kanallarını bağlayın.\n" +
            "4. **Aktiflik & Grafikler** sekmesinden sohbet ve ses odası yoğunluğunu takip edin.",
          inline: false,
        },
        {
          name: "💡 Yetki Hatırlatması",
          value: "Botun tüm özellikleri eksiksiz çalıştırabilmesi için roller hiyerarşisinde bot rolünün üst sıralarda olduğundan emin olun.",
          inline: false,
        }
      )
      .setThumbnail(guild.client.user?.displayAvatarURL() || null)
      .setFooter({ text: "SyncBot • Çoklu Sunucu Yönetim Sistemi" })
      .setTimestamp();

    // Mesajın gönderileceği kanalı bul
    let targetChannel = guild.systemChannel;

    if (!targetChannel || !targetChannel.permissionsFor(guild.members.me || "")?.has(PermissionFlagsBits.SendMessages)) {
      // Sistem kanalı yoksa ilk mesaj yazılabilir metin kanalını bul
      targetChannel = guild.channels.cache.find(
        (c) =>
          c.type === ChannelType.GuildText &&
          Boolean(c.permissionsFor(guild.members.me || "")?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]))
      ) as any;
    }

    if (targetChannel) {
      await targetChannel.send({ embeds: [welcomeEmbed] }).catch(() => null);
    } else {
      // Hiçbir kanala yazılamıyorsa sunucu sahibine DM ilet
      const owner = await guild.fetchOwner().catch(() => null);
      if (owner) {
        await owner.send({ embeds: [welcomeEmbed] }).catch(() => null);
      }
    }
  } catch (err) {
    console.warn(`[Sunucu Eklendi] ${guild.name} için kurulum mesajı gönderilemedi:`, err);
  }
}
