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
import { feedDeduplicator, type FeedDeduplicator } from "./FeedDeduplicator.js";

export interface FeedCardOptions {
  title: string;
  description: string;
  authorId?: string | null;
  timestampMs: number;
  jumpUrl: string;
  imageUrl?: string;
  settings: FeedSettings;
}

/**
 * Ana Sayfa Gönderi Akışı (Feed) iş mantığını yöneten servis (SRP & DIP).
 * Hem normal mesajları hem forum/thread başlıklarını hem de panel test kartlarını tek merkezden yönetir.
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

  public formatSnippet(
    rawContent: string,
    previewMax: number,
    hasImage: boolean,
    attachmentCount: number,
    fallbackText = ""
  ): string {
    let snippet = rawContent.trim();
    const limit = previewMax || 200;
    if (snippet.length > limit) {
      snippet = `${snippet.slice(0, limit).trim()}...`;
    }

    if (!snippet && hasImage) {
      snippet = "*[Görsel Paylaşımı]*";
    } else if (!snippet && attachmentCount > 0) {
      snippet = `*[${attachmentCount} adet dosya eki]*`;
    } else if (!snippet && fallbackText) {
      snippet = fallbackText;
    }

    return snippet;
  }

  public buildFeedPayload(options: FeedCardOptions): {
    embeds: [EmbedBuilder];
    components: [ActionRowBuilder<ButtonBuilder>];
  } {
    const embedColor = this.resolveEmbedColor(options.settings.embedColor);

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

    if (options.settings.includeImages !== false && options.imageUrl) {
      embed.setImage(options.imageUrl);
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("Gönderiye Git")
        .setURL(options.jumpUrl)
    );

    return { embeds: [embed], components: [row] };
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

    const imageAttachment = message.attachments.find((att) => att.contentType?.startsWith("image/"));
    const rawContent = message.content?.trim() || "";
    const minLen = typeof feed.minContentLength === "number" ? feed.minContentLength : 1;

    if (!imageAttachment && rawContent.length < minLen) {
      console.log(
        `[Akış] Mesaj çok kısa olduğu için (${rawContent.length} < ${minLen} karakter) akışa iletilmedi.`
      );
      return;
    }

    const snippet = this.formatSnippet(
      rawContent,
      feed.previewLength,
      Boolean(imageAttachment),
      message.attachments.size
    );

    const channelName = "name" in message.channel ? message.channel.name : "kanal";
    const embedTitle = isForumPost ? channelName : `📌 #${channelName}`;

    const payload = this.buildFeedPayload({
      title: embedTitle,
      description: snippet || "*Mesaj içeriği bulunmuyor.*",
      authorId: message.author.id,
      timestampMs: message.createdTimestamp,
      jumpUrl: message.url,
      imageUrl: imageAttachment?.url,
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
        await targetChannel.send(payload);
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
    const parentName = parentChannel ? parentChannel.name : "forum";
    const postTitle = thread.name || "Yeni Gönderi";

    const rawContent = starterMsg?.content?.trim() || "";
    const imageAttachment = starterMsg?.attachments.find((att) =>
      att.contentType?.startsWith("image/")
    );

    const snippet = this.formatSnippet(
      rawContent,
      feed.previewLength,
      Boolean(imageAttachment),
      starterMsg?.attachments.size ?? 0,
      postTitle
    );

    const authorId = starterMsg ? starterMsg.author.id : thread.ownerId;

    const payload = this.buildFeedPayload({
      title: postTitle,
      description: snippet || "*İçerik bulunmuyor.*",
      authorId,
      timestampMs: thread.createdTimestamp || Date.now(),
      jumpUrl: thread.url,
      imageUrl: imageAttachment?.url,
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
        await targetChannel.send(payload);
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
