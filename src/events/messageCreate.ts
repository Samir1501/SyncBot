import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Message,
  NewsChannel,
  TextChannel,
  ThreadChannel,
} from "discord.js";
import { getGuildSettings } from "../settings.js";
import { addActivity } from "../utils/activityTracker.js";

/**
 * Gönderi akışına iletilmiş olan mesaj ve thread kimliklerini (ID) takip eden önbellek.
 * Aynı gönderinin birden fazla kez akışa gönderilmesini önler.
 * Anahtar: kimlik, Değer: son geçerlilik zamanı (ms). Her kimlik için ayrı zamanlayıcı
 * oluşturmak yerine tek bir periyodik temizleyici kullanılır (daha az bellek / timer).
 */
const FEED_DEDUP_TTL_MS = 10 * 60 * 1000; // 10 dakika TTL
export const recentlyPostedFeedIds = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [id, expiresAt] of recentlyPostedFeedIds) {
    if (expiresAt <= now) recentlyPostedFeedIds.delete(id);
  }
}, 60 * 1000).unref();

export function markAndCheckPosted(id: string): boolean {
  const now = Date.now();
  const expiresAt = recentlyPostedFeedIds.get(id);
  if (expiresAt !== undefined && expiresAt > now) return true;
  recentlyPostedFeedIds.set(id, now + FEED_DEDUP_TTL_MS);
  return false;
}

/**
 * Belirtilen kaynak kanallardaki yeni gönderileri ve forum starter mesajlarını özetleyerek
 * sunucunun Ana Sayfa (Feed) kanalında paylaşır.
 */
export async function handleMessageCreate(message: Message): Promise<void> {
  // DM mesajlarını ve sunucu dışı içerikleri yoksay
  if (!message.guild || !message.channel) return;

  const { feed } = getGuildSettings(message.guild.id);
  if (!feed) return;

  const isThread = message.channel.isThread();
  const parentId = isThread ? message.channel.parentId : null;
  const parentChannel = isThread ? message.channel.parent : null;

  // Bu kanal veya üst kanalı izlenen kaynak kanallar arasında mı?
  const isDirectlyWatched = Boolean(feed.sourceChannelIds?.includes(message.channelId));
  const isParentWatched = Boolean(parentId && feed.sourceChannelIds?.includes(parentId));

  if (!isDirectlyWatched && !isParentWatched) return;

  // Modül aktif değilse veya hedef kanal seçilmemişse
  if (!feed.enabled) {
    console.log(`[Akış] İzlenen kanalda mesaj algılandı (#${"name" in message.channel ? message.channel.name : message.channelId}) fakat Akış Modülü 'Pasif' durumda.`);
    return;
  }
  if (!feed.targetChannelId) {
    console.log(`[Akış] İzlenen kanalda mesaj algılandı fakat hedef akış kanalı seçilmemiş.`);
    return;
  }

  // Sonsuz döngü engeli: Akış kanalındaki mesajları asla tekrar akışa atma
  if (message.channelId === feed.targetChannelId || parentId === feed.targetChannelId) return;

  // Botları yoksayma kontrolü
  if (message.author.bot && feed.ignoreBots) return;

  const isForumPost = isThread && (parentChannel?.type === ChannelType.GuildForum || parentChannel?.type === ChannelType.GuildMedia);

  // Mükerrer gönderi kontrolü
  if (isThread) {
    // Forum kanalında ise sadece İLK gönderi (starter post) akışa atılır; yorumlar değil
    if (markAndCheckPosted(`thread_${message.channel.id}`)) {
      return;
    }
    markAndCheckPosted(`msg_${message.id}`);
  } else {
    if (markAndCheckPosted(`msg_${message.id}`)) {
      return;
    }
  }

  // Resim/Görsel eki kontrolü
  const imageAttachment = message.attachments.find((att) =>
    att.contentType?.startsWith("image/")
  );

  const rawContent = message.content?.trim() || "";
  const minLen = typeof feed.minContentLength === "number" ? feed.minContentLength : 1;

  // Kısa/spam içerik kontrolü (eğer görsel yoksa ve mesaj minLen'den kısaysa akışa basma)
  if (!imageAttachment && rawContent.length < minLen) {
    console.log(`[Akış] Mesaj çok kısa olduğu için (${rawContent.length} < ${minLen} karakter) akışa iletilmedi.`);
    return;
  }

  // Metin kırpma & önizleme oluşturma
  const previewMax = feed.previewLength || 200;
  let snippet = rawContent;
  if (snippet.length > previewMax) {
    snippet = `${snippet.slice(0, previewMax).trim()}...`;
  }

  if (!snippet && imageAttachment) {
    snippet = "*[Görsel Paylaşımı]*";
  } else if (!snippet && message.attachments.size > 0) {
    snippet = `*[${message.attachments.size} adet dosya eki]*`;
  }

  const channelName = "name" in message.channel ? message.channel.name : "kanal";
  const parentName = parentChannel?.name || "forum";

  // Başlık belirleme: Gönderi başlığı varsa (forum post) onu yaz, normal mesaj kanalı ise otomatik başlık ata
  const embedTitle = isForumPost
    ? channelName
    : `📌 #${channelName}`;

  // Renk çözümleme
  let embedColor = 0xffe000;
  if (feed.embedColor && feed.embedColor.startsWith("#")) {
    const parsed = parseInt(feed.embedColor.replace("#", ""), 16);
    if (!isNaN(parsed)) embedColor = parsed;
  }

  // Akış Kartı Embedi
  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(embedTitle)
    .setDescription(snippet || "*Mesaj içeriği bulunmuyor.*")
    .addFields(
      {
        name: "Yazar",
        value: `<@${message.author.id}>`,
        inline: true,
      },
      {
        name: "Paylaşım",
        value: `<t:${Math.floor(message.createdTimestamp / 1000)}:R>`,
        inline: true,
      }
    );

  // Görsel önizlemesi ekleme
  if (feed.includeImages && imageAttachment) {
    embed.setImage(imageAttachment.url);
  }

  // Doğrudan mesaja zıplama Link Butonu
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Gönderiye Git")
      .setURL(message.url)
  );

  try {
    const targetChannel = await message.client.channels
      .fetch(feed.targetChannelId)
      .catch(() => null);

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

      console.log(`[Akış] #${channelName} gönderisi (${message.author.tag}) başarıyla #${targetChannel.name} akış kanalına gönderildi.`);

      addActivity({
        guildId: message.guild.id,
        type: "feed",
        title: isForumPost ? "Yeni Forum Gönderisi" : "Ana Sayfa Gönderi Akışı",
        desc: `#${channelName} gönderisi #${targetChannel.name} akışına iletildi`,
        icon: isForumPost ? "comments" : "newspaper",
        color: "#FFE000",
      });
    }
  } catch (error) {
    console.error("[Akış] Gönderi akış kanalına iletilirken hata oluştu:", error);
  }
}
