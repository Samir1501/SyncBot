import {
  Colors,
  EmbedBuilder,
  Message,
  PartialMessage,
} from "discord.js";
import { sendLog } from "../utils/logger.js";

export async function handleMessageUpdate(
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage
): Promise<void> {
  if (!newMessage.guild) return;

  // 1. Bot mesajlarını yoksay (botun kendi mesaj güncellemeleri veya webhooks)
  if (newMessage.author?.bot) return;

  // 2. Eğer eski mesaj önbellekte yoksa (partial) veya eski içerik bilinmiyorsa;
  // gerçek bir düzenleme olup olmadığı anlaşılamaz (ör. YouTube/link önizlemesi yüklenmesi).
  // Sahte "Mesaj Düzenlendi" logu basılmasını engelle!
  if (oldMessage.partial || !oldMessage.content) {
    return;
  }

  // 3. İçerik birebir aynıysa (ör. sadece embed/link kartı yüklendiğinde) loglama yapma
  if (oldMessage.content.trim() === (newMessage.content?.trim() || "")) {
    return;
  }

  const channelName = "name" in newMessage.channel ? newMessage.channel.name : "kanal";

  const embed = new EmbedBuilder()
    .setColor(Colors.Gold)
    .setTitle("✏️ Mesaj Düzenlendi")
    .setTimestamp();

  if (newMessage.author) {
    embed.setAuthor({
      name: `${newMessage.author.tag} (${newMessage.author.id})`,
      iconURL: newMessage.author.displayAvatarURL(),
    });
    embed.addFields({
      name: "Yazar",
      value: `<@${newMessage.author.id}> (\`${newMessage.author.id}\`)`,
      inline: true,
    });
  }

  embed.addFields(
    {
      name: "Kanal",
      value: `<#${newMessage.channelId}>`,
      inline: true,
    },
    {
      name: "Doğrudan Bağlantı",
      value: `[Mesaja Git](${newMessage.url})`,
      inline: true,
    }
  );

  const oldContent = oldMessage.content.trim();
  const newContent = newMessage.content?.trim() || "*İçerik boş.*";

  embed.addFields(
    {
      name: "Eski Hali",
      value: oldContent.length > 1000 ? `${oldContent.slice(0, 1000)}...` : oldContent,
    },
    {
      name: "Yeni Hali",
      value: newContent.length > 1000 ? `${newContent.slice(0, 1000)}...` : newContent,
    }
  );

  await sendLog(
    newMessage.guild,
    embed,
    {
      category: "messages",
      eventType: "messageUpdate",
      channelId: newMessage.channelId,
      channelName,
      user: newMessage.author
        ? {
            id: newMessage.author.id,
            tag: newMessage.author.tag,
            avatarUrl: newMessage.author.displayAvatarURL() || undefined,
            isBot: newMessage.author.bot,
          }
        : undefined,
      record: {
        title: "Mesaj Düzenlendi",
        description: `#${channelName} kanalında ${newMessage.author?.tag || "Kullanıcı"} mesajını düzenledi`,
        details: {
          author: newMessage.author?.tag || "Bilinmiyor",
          eski: oldContent.length > 50 ? `${oldContent.slice(0, 50)}...` : oldContent,
          yeni: newContent.length > 50 ? `${newContent.slice(0, 50)}...` : newContent,
        },
        color: "#eab308",
      },
    }
  );
}
