import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  NewsChannel,
  TextChannel,
  ThreadChannel,
} from "discord.js";
import { getGuildSettings } from "../settings.js";
import { addActivity } from "../utils/activityTracker.js";
import { markAndCheckPosted } from "./messageCreate.js";

/**
 * Forum kanallarında veya metin kanallarında yeni bir alt başlık / gönderi (Thread / Forum Post)
 * oluşturulduğunda tetiklenir ve Ana Sayfa Akışı kanalına önizleme kartı gönderir.
 */
export async function handleThreadCreate(thread: ThreadChannel): Promise<void> {
  // DM veya geçerli olmayan durumları yoksay
  if (!thread.guild || !thread.parentId) return;

  const { feed } = getGuildSettings(thread.guild.id);
  if (!feed) return;

  // Bu thread'in parent kanalı izlenen kaynak kanallar arasında mı?
  if (!feed.sourceChannelIds || !feed.sourceChannelIds.includes(thread.parentId)) return;

  if (!feed.enabled) {
    console.log(`[Akış] Forumda yeni gönderi algılandı (#${thread.name}) ancak Akış Modülü 'Pasif' durumda.`);
    return;
  }
  if (!feed.targetChannelId) {
    console.log(`[Akış] Forumda yeni gönderi algılandı (#${thread.name}) ancak hedef akış kanalı seçilmemiş.`);
    return;
  }

  // Sonsuz döngü engeli
  if (thread.parentId === feed.targetChannelId || thread.id === feed.targetChannelId) return;

  // Zaten yayınlandı mı kontrol et (deduplication)
  if (markAndCheckPosted(`thread_${thread.id}`)) return;

  // Discord bazen starter message'ı yarım saniye sonra indeksler, bekle ve getir
  let starterMsg = await thread.fetchStarterMessage().catch(() => null);
  if (!starterMsg) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    starterMsg = await thread.fetchStarterMessage().catch(() => null);
  }

  if (starterMsg) {
    markAndCheckPosted(`msg_${starterMsg.id}`);
    if (starterMsg.author.bot && feed.ignoreBots) return;
  } else if (thread.ownerId && feed.ignoreBots) {
    const member = await thread.guild.members.fetch(thread.ownerId).catch(() => null);
    if (member?.user.bot) return;
  }

  const parentChannel = thread.parent;
  const parentName = parentChannel ? parentChannel.name : "forum";
  const postTitle = thread.name || "Yeni Gönderi";

  const rawContent = starterMsg?.content?.trim() || "";
  const imageAttachment = starterMsg?.attachments.find((att) =>
    att.contentType?.startsWith("image/")
  );

  const previewMax = feed.previewLength || 200;
  let snippet = rawContent;
  if (snippet.length > previewMax) {
    snippet = `${snippet.slice(0, previewMax).trim()}...`;
  }

  if (!snippet && imageAttachment) {
    snippet = "*[Görsel Paylaşımı]*";
  } else if (!snippet && starterMsg && starterMsg.attachments.size > 0) {
    snippet = `*[${starterMsg.attachments.size} adet dosya eki]*`;
  } else if (!snippet) {
    snippet = postTitle;
  }

  // Renk çözümleme
  let embedColor = 0xffe000;
  if (feed.embedColor && feed.embedColor.startsWith("#")) {
    const parsed = parseInt(feed.embedColor.replace("#", ""), 16);
    if (!isNaN(parsed)) embedColor = parsed;
  }

  const authorId = starterMsg ? starterMsg.author.id : thread.ownerId;

  const embedTitle = postTitle || "Yeni Gönderi";

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(embedTitle)
    .setDescription(snippet || "*İçerik bulunmuyor.*")
    .addFields(
      {
        name: "Yazar",
        value: authorId ? `<@${authorId}>` : "Bilinmiyor",
        inline: true,
      },
      {
        name: "Paylaşım",
        value: `<t:${Math.floor((thread.createdTimestamp || Date.now()) / 1000)}:R>`,
        inline: true,
      }
    );

  if (feed.includeImages && imageAttachment) {
    embed.setImage(imageAttachment.url);
  }

  // Doğrudan foruma zıplama Link Butonu
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Gönderiye Git")
      .setURL(thread.url)
  );

  try {
    const targetChannel = await thread.client.channels.fetch(feed.targetChannelId).catch(() => null);

    if (!targetChannel) {
      console.warn(`[Akış] '${feed.targetChannelId}' ID'li hedef akış kanalı bulunamadı.`);
      return;
    }

    if (
      targetChannel instanceof TextChannel ||
      targetChannel instanceof NewsChannel ||
      targetChannel instanceof ThreadChannel
    ) {
      await targetChannel.send({
        embeds: [embed],
        components: [row],
      });

      console.log(`[Akış] 💬 #${parentName} forum gönderisi ("${postTitle}") başarıyla #${targetChannel.name} akış kanalına gönderildi.`);

      addActivity({
        guildId: thread.guild.id,
        type: "feed",
        title: "Yeni Forum Gönderisi",
        desc: `#${parentName} kanalında "${postTitle}" akışa iletildi`,
        icon: "comments",
        color: "#FFE000",
      });
    }
  } catch (error) {
    console.error("[Akış] Forum gönderisi akış kanalına iletilirken hata oluştu:", error);
  }
}
