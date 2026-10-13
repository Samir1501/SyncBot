import {
  AuditLogEvent,
  Colors,
  EmbedBuilder,
  Message,
  PartialMessage,
  SnowflakeUtil,
} from "discord.js";
import { sendLog } from "../utils/logger.js";
import { addActivity } from "../utils/activityTracker.js";

export async function handleMessageDelete(message: Message | PartialMessage): Promise<void> {
  // DM mesajlarını yoksay
  if (!message.guild) return;

  const content = message.content?.trim();
  const hasAttachments = Boolean(message.attachments && message.attachments.size > 0);

  // 1. Hayalet / İçeriksiz Eski Mesaj Koruması:
  // Eğer mesaj önbellekte yoksa (partial), yazarı bilinmiyorsa ve ne içeriği ne de eki varsa;
  // bu Discord'un çok eski önbelleklenmemiş bir silme olayıdır. Boş ve anlamsız log basmayı engelle!
  if (!message.author && !content && !hasAttachments) {
    console.log(`[Log Guard] #${message.channelId} kanalında içeriği ve yazarı bulunmayan önbellek öncesi mesaj silme olayı yok sayıldı.`);
    return;
  }

  const channelName = "name" in message.channel ? message.channel.name : "kanal";

  // 2. Mesajın ne zaman yazıldığını Snowflake ID üzerinden milisaniyesine kadar hesapla
  let createdUnix: number | null = null;
  try {
    const createdTimestamp = message.createdTimestamp || SnowflakeUtil.timestampFrom(message.id);
    if (createdTimestamp && !isNaN(Number(createdTimestamp))) {
      createdUnix = Math.floor(Number(createdTimestamp) / 1000);
    }
  } catch {
    // Snowflake çözümlenemezse devam et
  }

  // 3. Denetim Kaydından (Audit Log) mesajı kimin sildiğini tespit et
  let executorTag = "";
  let executorId = "";
  try {
    const auditLogs = await message.guild.fetchAuditLogs({
      type: AuditLogEvent.MessageDelete,
      limit: 1,
    });
    const entry = auditLogs.entries.first();
    // Eğer silme kaydı hedef kullanıcının mesajına aitse ve son 12 saniyede bir yetkili sildiyse
    if (
      entry &&
      entry.extra &&
      "channel" in entry.extra &&
      entry.extra.channel?.id === message.channelId &&
      entry.createdTimestamp &&
      Date.now() - entry.createdTimestamp < 12000
    ) {
      if (entry.executor) {
        executorTag = entry.executor.tag || "";
        executorId = entry.executor.id || "";
      }
    }
  } catch {
    // Yetki yoksa normal akışa devam et
  }

  if (!message.author?.bot) {
    addActivity({
      guildId: message.guild.id,
      type: "message_delete",
      title: "Mesaj Silindi",
      desc: `#${channelName} kanalında bir mesaj silindi${executorTag ? ` (Silen: @${executorTag})` : ""}`,
      icon: "trash-can",
      color: "#f59e0b",
    });
  }

  const embed = new EmbedBuilder()
    .setColor(Colors.Red)
    .setTitle("🗑️ Mesaj Silindi")
    .setTimestamp();

  if (message.author) {
    embed.setAuthor({
      name: `${message.author.tag} (${message.author.id})`,
      iconURL: message.author.displayAvatarURL(),
    });
    embed.addFields({
      name: "Yazar",
      value: `<@${message.author.id}> (\`${message.author.id}\`)`,
      inline: true,
    });
  } else {
    embed.addFields({
      name: "Yazar",
      value: "*Bilinmiyor (Eski / Önbellek öncesi mesaj)*",
      inline: true,
    });
  }

  embed.addFields({
    name: "Kanal",
    value: `<#${message.channelId}> (\`${message.channelId}\`)`,
    inline: true,
  });

  // Mesajın orijinal gönderilme tarihi (özellikle eski mesajların silindiği anlaşılsın diye)
  if (createdUnix) {
    embed.addFields({
      name: "Orijinal Gönderim Tarihi",
      value: `<t:${createdUnix}:f> (<t:${createdUnix}:R>)`,
      inline: true,
    });
  }

  // Eğer mesajı bir moderatör sildiyse belirt
  if (executorId) {
    embed.addFields({
      name: "Silen Yetkili",
      value: `<@${executorId}> (\`${executorTag}\`)`,
      inline: true,
    });
  }

  if (content) {
    // 1024 karakter sınırını aşmamak için güvenli kırpma
    const safeContent = content.length > 1000 ? `${content.slice(0, 1000)}...` : content;
    embed.addFields({ name: "Silinen İçerik", value: safeContent });
  } else {
    embed.addFields({
      name: "Silinen İçerik",
      value: "*Mesaj metni yok (Sadece görsel veya önbellek öncesi mesaj).*",
    });
  }

  // Ekler (görsel/dosya) varsa listele
  if (message.attachments && message.attachments.size > 0) {
    const attachmentUrls = message.attachments.map((att) => att.url).join("\n");
    embed.addFields({
      name: `Ek Dosyalar (${message.attachments.size})`,
      value: attachmentUrls.slice(0, 1000),
    });

    const firstImage = message.attachments.find((att) =>
      att.contentType?.startsWith("image/")
    );
    if (firstImage) {
      embed.setImage(firstImage.url);
    }
  }

  await sendLog(
    message.guild,
    embed,
    {
      category: "messages",
      eventType: "messageDelete",
      channelId: message.channelId,
      channelName,
      user: message.author
        ? {
            id: message.author.id,
            tag: message.author.tag,
            avatarUrl: message.author.displayAvatarURL() || undefined,
            isBot: message.author.bot,
          }
        : undefined,
      record: {
        title: "Mesaj Silindi",
        description: `#${channelName} kanalında ${message.author?.tag || "Kullanıcı"} mesajı silindi${executorTag ? ` (Yetkili: ${executorTag})` : ""}`,
        details: {
          author: message.author?.tag || "Bilinmiyor",
          content: content ? (content.length > 80 ? `${content.slice(0, 80)}...` : content) : "Boş",
          originalDate: createdUnix ? new Date(createdUnix * 1000).toISOString() : "Bilinmiyor",
          executor: executorTag || "Kullanıcı Kendisi",
        },
        color: "#ef4444",
      },
    }
  );
}
