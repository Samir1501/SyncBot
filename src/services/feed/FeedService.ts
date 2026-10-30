import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Message,
  NewsChannel,
  TextChannel,
  ThreadChannel,
} from "discord.js";
import { activityRepository, type IActivityRepository } from "../../repositories/activityRepository.js";
import { settingsRepository } from "../../settings/repository.js";
import type { FeedSettings, ISettingsRepository } from "../../settings/types.js";
import { extractVideoThumbnail } from "../../utils/videoThumbnail.js";
import { feedDeduplicator, type FeedDeduplicator } from "./FeedDeduplicator.js";

export interface FeedCardOptions {
  title: string;
  description: string;
  authorId?: string | null;
  timestampMs: number;
  jumpUrl: string;
  imageUrl?: string;
  imageBuffer?: Buffer;
  videoUrl?: string;
  isVideo?: boolean;
  settings: FeedSettings;
}

export interface ResolvedMedia {
  imageUrl?: string;
  imageBuffer?: Buffer;
  videoUrl?: string;
  videoAttachment?: {
    url: string;
    name: string;
  };
  hasImage: boolean;
  hasVideo: boolean;
  hasLink: boolean;
}

/**
 * Ana Sayfa Gönderi Akışı (Feed) iş mantığını yöneten servis (SRP & DIP).
 * Resimler, bağlantı önizlemeleri ve videolardan çıkarılan kapak karelerini (FFmpeg Thumbnail)
 * doğrudan zengin kutunun (Embed) içine gömülü olarak paylaşır.
 */
export class FeedService {
  constructor(
    private readonly settingsRepo: ISettingsRepository = settingsRepository,
    private readonly activityRepo: IActivityRepository = activityRepository,
    private readonly deduplicator: FeedDeduplicator = feedDeduplicator
  ) {}

  public resolveEmbedColor(hexColor?: string): number {
    let embedColor = 0xffe000;
    if (hexColor && hexColor.startsWith("#")) {
      const parsed = parseInt(hexColor.replace("#", ""), 16);
      if (!isNaN(parsed)) embedColor = parsed;
    }
    return embedColor;
  }

  /**
   * Mesajdaki görsel, video ve bağlantı embed'lerini çözer.
   * Videolar için ffmpeg-static ile ilk kareden yüksek kaliteli kapak görseli Buffer'ı üretir.
   */
  public async resolveMessageMedia(message: Message): Promise<ResolvedMedia> {
    let imageUrl: string | undefined;
    let imageBuffer: Buffer | undefined;
    let videoUrl: string | undefined;
    let videoAttachment: { url: string; name: string } | undefined;

    // 1. Ekli Dosyalar (Attachments)
    const imageAtt = message.attachments.find(
      (att) => att.contentType?.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(att.name)
    );
    if (imageAtt) {
      imageUrl = imageAtt.url;
    }

    const videoAtt = message.attachments.find(
      (att) => att.contentType?.startsWith("video/") || /\.(mp4|webm|mov|mkv)$/i.test(att.name)
    );
    if (videoAtt) {
      videoUrl = videoAtt.url;
      videoAttachment = { url: videoAtt.url, name: videoAtt.name || "video.mp4" };
    }

    // 2. Mesaj metnindeki doğrudan bağlantılar (Direct URLs)
    const rawContent = message.content?.trim() || "";
    const hasAnyLink = /https?:\/\/\S+/i.test(rawContent);

    if (!imageUrl) {
      const directImgMatch = rawContent.match(
        /\bhttps?:\/\/\S+?\.(?:png|jpe?g|gif|webp)(?:\?\S*)?(?=#|\s|$)/i
      );
      if (directImgMatch) {
        imageUrl = directImgMatch[0];
      }
    }

    if (!videoUrl) {
      const directVidMatch = rawContent.match(
        /\bhttps?:\/\/\S+?\.(?:mp4|webm|mov)(?:\?\S*)?(?=#|\s|$)/i
      );
      if (directVidMatch) {
        videoUrl = directVidMatch[0];
      }
    }

    // 3. Discord Zengin Bağlantı Önizlemeleri (Link Embeds / OpenGraph)
    if (hasAnyLink && !imageUrl) {
      let embeds = message.embeds;

      if (!embeds || embeds.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const freshMsg = await message.fetch().catch(() => null);
        if (freshMsg) {
          embeds = freshMsg.embeds;
        }
      }

      if (embeds && embeds.length > 0) {
        for (const emb of embeds) {
          if (!imageUrl) {
            if (emb.thumbnail?.proxyURL || emb.thumbnail?.url) {
              imageUrl = emb.thumbnail.proxyURL || emb.thumbnail.url;
            } else if (emb.image?.proxyURL || emb.image?.url) {
              imageUrl = emb.image.proxyURL || emb.image.url;
            }
          }
          if (!videoUrl && emb.video?.url) {
            videoUrl = emb.video.url;
          }
        }
      }
    }

    // 4. Video Eklerinden FFmpeg ile İlk Kareyi (Thumbnail) Yakalama
    // Eğer mesajda video eki varsa ve harici bir görsel yoksa videodan kapak karesi çıkar
    if (videoAtt && !imageUrl && !imageBuffer) {
      try {
        console.log(`[Akış] 🎬 Video tespit edildi (${videoAtt.name}), FFmpeg ile kapak karesi çıkarılıyor...`);
        const extracted = await extractVideoThumbnail(videoAtt.url);
        if (extracted) {
          imageBuffer = extracted;
          console.log(`[Akış] ✅ Video kapak karesi başarıyla üretildi (${extracted.length} bayt).`);
        }
      } catch (thumbErr) {
        console.warn("[Akış] Video kapak karesi çıkarılırken hata oluştu:", thumbErr);
      }
    }

    return {
      imageUrl,
      imageBuffer,
      videoUrl,
      videoAttachment,
      hasImage: Boolean(imageUrl || imageBuffer),
      hasVideo: Boolean(videoUrl || videoAttachment),
      hasLink: hasAnyLink,
    };
  }

  public formatSnippet(
    rawContent: string,
    previewMax: number,
    hasImage: boolean,
    hasVideo: boolean,
    attachmentCount: number,
    hasLink: boolean,
    fallbackText = ""
  ): string {
    let snippet = rawContent.trim();
    const limit = previewMax || 200;
    if (snippet.length > limit) {
      snippet = `${snippet.slice(0, limit).trim()}...`;
    }

    if (!snippet) {
      if (hasVideo) {
        snippet = "*🎬 Video Paylaşımı*";
      } else if (hasImage) {
        snippet = "*[Görsel Paylaşımı]*";
      } else if (attachmentCount > 0) {
        snippet = `*[${attachmentCount} adet dosya eki]*`;
      } else if (hasLink) {
        snippet = "*[Bağlantı Paylaşımı]*";
      } else if (fallbackText) {
        snippet = fallbackText;
      }
    }

    return snippet;
  }

  public buildFeedPayload(options: FeedCardOptions): {
    embeds: [EmbedBuilder];
    components: [ActionRowBuilder<ButtonBuilder>];
    files: { attachment: string | Buffer; name: string }[];
  } {
    const embedColor = this.resolveEmbedColor(options.settings.embedColor);
    const files: { attachment: string | Buffer; name: string }[] = [];

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(options.title)
      .setDescription(options.description || "*Mesaj içeriği bulunmuyor.*")
      .addFields(
        {
          name: "Yazar",
          value: options.authorId ? `<@${options.authorId}>` : "Bilinmiyor",
          inline: true,
        },
        {
          name: "Paylaşım",
          value: `<t:${Math.floor(options.timestampMs / 1000)}:R>`,
          inline: true,
        }
      );

    if (options.settings.includeImages !== false) {
      // 1. Öncelik: Videodan yakalanan yerel kapak Buffer'ı (attachment:// formatıyla embed içine gömülür)
      if (options.imageBuffer) {
        const thumbName = "video-thumbnail.jpg";
        files.push({ attachment: options.imageBuffer, name: thumbName });
        embed.setImage(`attachment://${thumbName}`);
      }
      // 2. Öncelik: Harici resim URL'si veya web önizleme görseli
      else if (options.imageUrl) {
        embed.setImage(options.imageUrl);
      }
    }

    const row = new ActionRowBuilder<ButtonBuilder>();
    row.addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("Gönderiye Git")
        .setURL(options.jumpUrl)
    );

    return { embeds: [embed], components: [row], files };
  }

  public async handleMessage(message: Message): Promise<void> {
    if (!message.guild || !message.channel) return;

    const { feed } = this.settingsRepo.getGuildSettings(message.guild.id);
    if (!feed) return;

    const isThread = message.channel.isThread();
    const parentId = isThread ? message.channel.parentId : null;
    const parentChannel = isThread ? message.channel.parent : null;

    const isDirectlyWatched = Boolean(feed.sourceChannelIds?.includes(message.channelId));
    const isParentWatched = Boolean(parentId && feed.sourceChannelIds?.includes(parentId));

    if (!isDirectlyWatched && !isParentWatched) return;

    if (!feed.enabled) {
      console.log(
        `[Akış] İzlenen kanalda mesaj algılandı (#${"name" in message.channel ? message.channel.name : message.channelId}) fakat Akış Modülü 'Pasif' durumda.`
      );
      return;
    }
    if (!feed.targetChannelId) {
      console.log(`[Akış] İzlenen kanalda mesaj algılandı fakat hedef akış kanalı seçilmemiş.`);
      return;
    }

    // Sonsuz döngü engeli
    if (message.channelId === feed.targetChannelId || parentId === feed.targetChannelId) return;

    // Botları yoksayma kontrolü
    if (message.author.bot && feed.ignoreBots) return;

    const isForumPost =
      isThread &&
      (parentChannel?.type === ChannelType.GuildForum || parentChannel?.type === ChannelType.GuildMedia);

    // Mükerrer gönderi kontrolü
    if (isThread) {
      if (this.deduplicator.markAndCheck(`thread_${message.channel.id}`)) {
        return;
      }
      this.deduplicator.markAndCheck(`msg_${message.id}`);
    } else {
      if (this.deduplicator.markAndCheck(`msg_${message.id}`)) {
        return;
      }
    }

    // Medya çözme (Resim, Video Kapak Karesi ve Bağlantı Embed Görselleri)
    const media = await this.resolveMessageMedia(message);
    const rawContent = message.content?.trim() || "";
    const minLen = typeof feed.minContentLength === "number" ? feed.minContentLength : 1;

    // Eğer mesajda herhangi bir medya yoksa karakter sınırına bak
    const hasMedia = media.hasImage || media.hasVideo;
    if (!hasMedia && rawContent.length < minLen) {
      console.log(
        `[Akış] Mesaj çok kısa olduğu için (${rawContent.length} < ${minLen} karakter) ve medya içermediği için akışa iletilmedi.`
      );
      return;
    }

    const snippet = this.formatSnippet(
      rawContent,
      feed.previewLength,
      media.hasImage,
      media.hasVideo,
      message.attachments.size,
      media.hasLink
    );

    const channelName = ("name" in message.channel && message.channel.name) ? message.channel.name : "kanal";
    const embedTitle = isForumPost ? channelName : `📌 #${channelName}`;

    const payload = this.buildFeedPayload({
      title: embedTitle,
      description: snippet || "*Mesaj içeriği bulunmuyor.*",
      authorId: message.author.id,
      timestampMs: message.createdTimestamp,
      jumpUrl: message.url,
      imageUrl: media.imageUrl,
      imageBuffer: media.imageBuffer,
      videoUrl: media.videoUrl,
      isVideo: media.hasVideo,
      settings: feed,
    });

    try {
      const targetChannel = await message.client.channels.fetch(feed.targetChannelId).catch(() => null);
      if (!targetChannel) {
        console.warn(`[Akış] '${feed.targetChannelId}' ID'li hedef akış kanalı bulunamadı.`);
        return;
      }

      if (
        targetChannel instanceof TextChannel ||
        targetChannel instanceof NewsChannel ||
        targetChannel instanceof ThreadChannel
      ) {
        // Eğer videodan kapak çıkarılamadıysa ve görsel yoksa fallback olarak video dosyasını iliştir
        if (!media.hasImage && media.videoAttachment) {
          try {
            await targetChannel.send({
              embeds: payload.embeds,
              components: payload.components,
              files: [
                {
                  attachment: media.videoAttachment.url,
                  name: media.videoAttachment.name,
                },
              ],
            });
          } catch {
            await targetChannel.send(payload);
          }
        } else {
          // Normal resim veya FFmpeg ile embed içine gömülen kapak görseli
          await targetChannel.send(payload);
        }

        console.log(
          `[Akış] #${channelName} gönderisi (${message.author.tag}) başarıyla #${targetChannel.name} akış kanalına gönderildi.`
        );

        this.activityRepo.add({
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

  public async handleThread(thread: ThreadChannel): Promise<void> {
    if (!thread.guild || !thread.parentId) return;

    const { feed } = this.settingsRepo.getGuildSettings(thread.guild.id);
    if (!feed) return;

    if (!feed.sourceChannelIds || !feed.sourceChannelIds.includes(thread.parentId)) return;

    if (!feed.enabled) {
      console.log(
        `[Akış] Forumda yeni gönderi algılandı (#${thread.name}) ancak Akış Modülü 'Pasif' durumda.`
      );
      return;
    }
    if (!feed.targetChannelId) {
      console.log(
        `[Akış] Forumda yeni gönderi algılandı (#${thread.name}) ancak hedef akış kanalı seçilmemiş.`
      );
      return;
    }

    if (thread.parentId === feed.targetChannelId || thread.id === feed.targetChannelId) return;

    if (this.deduplicator.markAndCheck(`thread_${thread.id}`)) return;

    let starterMsg = await thread.fetchStarterMessage().catch(() => null);
    if (!starterMsg) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      starterMsg = await thread.fetchStarterMessage().catch(() => null);
    }

    if (starterMsg) {
      this.deduplicator.markAndCheck(`msg_${starterMsg.id}`);
      if (starterMsg.author.bot && feed.ignoreBots) return;
    } else if (thread.ownerId && feed.ignoreBots) {
      const member = await thread.guild.members.fetch(thread.ownerId).catch(() => null);
      if (member?.user.bot) return;
    }

    const parentChannel = thread.parent;
    const parentName = parentChannel?.name || "forum";
    const postTitle = thread.name || "Yeni Gönderi";

    const media = starterMsg
      ? await this.resolveMessageMedia(starterMsg)
      : {
          imageUrl: undefined,
          imageBuffer: undefined,
          videoUrl: undefined,
          videoAttachment: undefined,
          hasImage: false,
          hasVideo: false,
          hasLink: false,
        };

    const rawContent = starterMsg?.content?.trim() || "";

    const snippet = this.formatSnippet(
      rawContent,
      feed.previewLength,
      media.hasImage,
      media.hasVideo,
      starterMsg?.attachments.size ?? 0,
      media.hasLink,
      postTitle
    );

    const authorId = starterMsg ? starterMsg.author.id : thread.ownerId;

    const payload = this.buildFeedPayload({
      title: postTitle,
      description: snippet || "*İçerik bulunmuyor.*",
      authorId,
      timestampMs: thread.createdTimestamp || Date.now(),
      jumpUrl: thread.url,
      imageUrl: media.imageUrl,
      imageBuffer: media.imageBuffer,
      videoUrl: media.videoUrl,
      isVideo: media.hasVideo,
      settings: feed,
    });

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
        if (!media.hasImage && media.videoAttachment) {
          try {
            await targetChannel.send({
              embeds: payload.embeds,
              components: payload.components,
              files: [
                {
                  attachment: media.videoAttachment.url,
                  name: media.videoAttachment.name,
                },
              ],
            });
          } catch {
            await targetChannel.send(payload);
          }
        } else {
          await targetChannel.send(payload);
        }

        console.log(
          `[Akış] 💬 #${parentName} forum gönderisi ("${postTitle}") başarıyla #${targetChannel.name} akış kanalına gönderildi.`
        );

        this.activityRepo.add({
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

  public async sendTestCard(client: Client, guildId: string): Promise<{ channelName: string }> {
    const { feed } = this.settingsRepo.getGuildSettings(guildId);
    if (!feed.targetChannelId) {
      throw new Error("Lütfen önce bir hedef akış kanalı seçip kaydedin.");
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      throw new Error("Sunucu bulunamadı.");
    }

    const channel = await client.channels.fetch(feed.targetChannelId).catch(() => null);
    if (!channel || channel.isDMBased() || !channel.isTextBased()) {
      throw new Error("Hedef akış kanalı bulunamadı veya bota mesaj izni yok.");
    }

    const firstSourceId = feed.sourceChannelIds?.[0];
    const sourceChannel = firstSourceId ? guild.channels.cache.get(firstSourceId) : null;
    const isForum = sourceChannel
      ? sourceChannel.type === ChannelType.GuildForum || sourceChannel.type === ChannelType.GuildMedia
      : false;
    const channelLabel = sourceChannel
      ? isForum
        ? `💬 ${sourceChannel.name} (Forum)`
        : `📌 #${sourceChannel.name}`
      : "📌 #kaynak-kanalı";

    const payload = this.buildFeedPayload({
      title: channelLabel,
      description:
        "Bu bir test gönderi akışı önizlemesidir! Seçtiğiniz kaynak kanallarda yeni mesajlar ve forum gönderileri paylaşıldığında, içerik özetleri ve doğrudan gönderi bağlantısı bu formatta otomatik paylaşılacaktır.",
      authorId: client.user?.id,
      timestampMs: Date.now(),
      jumpUrl: `https://discord.com/channels/${guild.id}/${channel.id}`,
      imageUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80",
      settings: feed,
    });

    await channel.send(payload);

    this.activityRepo.add({
      guildId: guild.id,
      type: "feed",
      title: "Test Gönderi Akışı",
      desc: `#${channel.name} kanalına test kartı basıldı`,
      icon: "newspaper",
      color: "#FFE000",
    });

    return { channelName: channel.name };
  }
}

export const feedService = new FeedService();
