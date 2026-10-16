import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  NewsChannel,
  PermissionFlagsBits,
  TextChannel,
  ThreadChannel,
} from "discord.js";
import { activityRepository, type IActivityRepository } from "../../repositories/activityRepository.js";
import type { SteamSettings } from "../../settings/types.js";
import type { FormattedSteamAnnouncement, SteamAppDetails } from "../steamService.js";

type SendableChannel = TextChannel | NewsChannel | ThreadChannel;

const STEAM_LOGO_URL =
  "https://store.cloudflare.steamstatic.com/public/shared/images/header/globalheader_logo.png";

/**
 * Single Responsibility (SRP): Formatlanmış Steam duyurusunu Discord Embed ve butonlarına
 * dönüştürüp hedef sunucu kanalına iletir.
 */
export class SteamDiscordNotifier {
  constructor(private readonly activityRepo: IActivityRepository = activityRepository) {}

  private resolveColor(hexColor?: string): number {
    if (!hexColor) return 0x1b2838;
    const cleaned = hexColor.replace("#", "").trim();
    const parsed = parseInt(cleaned, 16);
    return Number.isNaN(parsed) ? 0x1b2838 : parsed;
  }

  private resolveMentionContent(mentionRoleId?: string): string | undefined {
    const role = mentionRoleId?.trim();
    if (!role) return undefined;
    if (role === "everyone") return "@everyone";
    if (role === "here") return "@here";
    return `<@&${role}>`;
  }

  public async sendAnnouncement(
    client: Client,
    guildId: string,
    announcement: FormattedSteamAnnouncement,
    appDetails: SteamAppDetails,
    steamSettings: SteamSettings,
    isTest = false
  ): Promise<{ success: boolean; message: string }> {
    const guild =
      client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      return { success: false, message: "Sunucu bulunamadı." };
    }

    const targetChannelId = steamSettings.channelId;
    if (!targetChannelId) {
      return { success: false, message: "Hedef kanal yapılandırılmamış." };
    }

    const channel = (guild.channels.cache.get(targetChannelId) ||
      (await guild.channels.fetch(targetChannelId).catch(() => null))) as SendableChannel | null;

    if (!channel) {
      return { success: false, message: "Hedef kanal sunucuda bulunamadı veya bota kapalı." };
    }

    const validTypes = [
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement,
      ChannelType.PublicThread,
      ChannelType.PrivateThread,
      ChannelType.AnnouncementThread,
    ];
    if (!validTypes.includes(channel.type)) {
      return { success: false, message: "Hedef kanal mesaj gönderilebilir bir metin kanalı değil." };
    }

    const me = guild.members.me;
    if (me) {
      const perms = channel.permissionsFor(me);
      if (
        !perms ||
        !perms.has([
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
        ])
      ) {
        return {
          success: false,
          message: "Botun hedef kanalda Mesaj Gönderme veya Embed Bağlantısı yetkisi yok.",
        };
      }
    }

    const embed = new EmbedBuilder()
      .setColor(this.resolveColor(steamSettings.embedColor))
      .setAuthor({
        name: `${appDetails.name}${isTest ? " (Test Gönderimi)" : ""}`,
        iconURL: STEAM_LOGO_URL,
        url: appDetails.storeUrl,
      })
      .setTitle(
        announcement.title.length > 250
          ? `${announcement.title.slice(0, 247)}...`
          : announcement.title
      )
      .setURL(announcement.url)
      .setDescription(announcement.summary)
      .setFooter({
        text: `Steam Güncelleme Notları • ${announcement.author || "Geliştirici"}`,
        iconURL: STEAM_LOGO_URL,
      })
      .setTimestamp(announcement.date);

    if (announcement.imageUrl) {
      embed.setImage(announcement.imageUrl);
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("Steam'de İncele")
        .setURL(announcement.url),
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("Mağaza Sayfası")
        .setURL(appDetails.storeUrl)
    );

    const content = this.resolveMentionContent(steamSettings.mentionRoleId);

    try {
      await channel.send({
        content,
        embeds: [embed],
        components: [row],
      });

      this.activityRepo.add({
        guildId,
        type: "steam",
        title: isTest ? "Steam Test Duyurusu Gönderildi" : "Steam Güncellemesi Paylaşıldı",
        desc: `${appDetails.name}: "${announcement.title}"`,
        icon: "gamepad",
        color: "#1b2838",
      });

      return { success: true, message: "Güncelleme duyurusu başarıyla paylaşıldı." };
    } catch (err: any) {
      console.error(`[SteamWatcher] Mesaj gönderilemedi (${guild.name} / ${channel.name}):`, err);
      return {
        success: false,
        message: `Mesaj gönderilemedi: ${err?.message || "Bilinmeyen hata"}`,
      };
    }
  }
}

export const steamDiscordNotifier = new SteamDiscordNotifier();
