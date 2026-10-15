import {
  Client,
  EmbedBuilder,
  Guild,
  NewsChannel,
  TextChannel,
  ThreadChannel,
} from "discord.js";
import { config } from "../config.js";
import { getGuildSettings } from "../settings.js";
import { addLogRecord, type LogCategory, type LogEventType } from "./logStore.js";

export interface LogSendOptions {
  category?: LogCategory;
  eventType?: LogEventType;
  channelId?: string;
  channelName?: string | null;
  user?: {
    id: string;
    tag: string;
    avatarUrl?: string;
    isBot?: boolean;
  };
  record?: {
    title: string;
    description: string;
    details?: Record<string, string | number | boolean>;
    color?: string;
  };
}

/**
 * Sunucuya özel denetim kaydını (log) ilgili sunucunun seçili kanalına gönderir
 * ve web paneli için canlı log kuyruğuna kaydeder.
 * @param target Guild veya Client nesnesi. Guild verilirse o sunucunun ayarı okunur.
 */
export async function sendLog(
  target: Guild | Client,
  embed: EmbedBuilder,
  options?: LogSendOptions,
  guildIdOverride?: string
): Promise<void> {
  const client = target instanceof Guild ? target.client : target;
  const guildId = target instanceof Guild ? target.id : (guildIdOverride || null);

  const { logging } = getGuildSettings(guildId);
  if (!logging.enabled) return;

  // 1. Olay Bazlı Filtre Kontrolü (Modüler Filtreler)
  if (options?.eventType && logging.events && logging.events[options.eventType] === false) {
    return;
  }

  // 2. Akıllı Muafiyetler: Botları Yoksay
  if (options?.user?.isBot && logging.filters?.ignoreBots) {
    return;
  }

  // 3. Akıllı Muafiyetler: Yoksayılan Kanallar
  if (options?.channelId && logging.filters?.ignoredChannels?.includes(options.channelId)) {
    return;
  }

  // Olay bazlı özel renk veya genel varsayılan renk
  let chosenColor = logging.appearance?.embedColor || "#FFE000";
  if (options?.eventType && logging.appearance?.eventColors && (logging.appearance.eventColors as Record<string, string>)[options.eventType]) {
    chosenColor = (logging.appearance.eventColors as Record<string, string>)[options.eventType];
  }

  // 4. Canlı Panel Günlüğü (Web Log Explorer) için kaydet
  if (guildId && options?.record) {
    addLogRecord({
      guildId,
      category: options.category || "messages",
      eventType: options.eventType || "messageDelete",
      title: options.record.title,
      description: options.record.description,
      user: options.user,
      channel: options.channelId ? { id: options.channelId, name: options.channelName || "kanal" } : undefined,
      details: options.record.details,
      color: chosenColor || options.record.color || "#FFE000",
    });
  }

  // 5. Kanallara Göre Ayrıştırma (Multi-Channel Routing)
  let destinationChannelId = "";
  if (logging.channels?.mode === "multi" && options?.category) {
    const catChannel = logging.channels[options.category];
    if (catChannel) {
      destinationChannelId = catChannel;
    }
  }

  // Eğer ayrıştırılmış kanal yoksa veya "single" modundaysa varsayılan kanalı kullan
  if (!destinationChannelId) {
    destinationChannelId = logging.channels?.default || logging.channelId || config.logChannelId;
  }

  if (!destinationChannelId) return;

  // 6. Görünüm Ayarları (Detay Düzeyi & Renk)
  if (logging.appearance?.detailLevel === "compact") {
    // Kompakt modda gereksiz büyük görselleri kaldır
    embed.setImage(null);
  }
  if (chosenColor && chosenColor.startsWith("#")) {
    const rawHex = chosenColor.replace("#", "");
    const hexNum = parseInt(rawHex, 16);
    if (!isNaN(hexNum)) {
      embed.setColor(hexNum);
    }
  }

  try {
    const channel = await client.channels.fetch(destinationChannelId).catch(() => null);

    if (!channel) {
      console.warn(`[Log] '${destinationChannelId}' ID'li log kanalı bulunamadı.`);
      return;
    }

    if (
      channel instanceof TextChannel ||
      channel instanceof NewsChannel ||
      channel instanceof ThreadChannel
    ) {
      await channel.send({ embeds: [embed] });
    } else {
      console.warn("[Log] Belirtilen kanal mesaj gönderilebilir bir metin kanalı değil.");
    }
  } catch (error) {
    console.error("[Log] Log kanalına mesaj gönderilirken hata oluştu:", error);
  }
}
