import {
  Client,
  EmbedBuilder,
  Guild,
  NewsChannel,
  TextChannel,
  ThreadChannel,
} from "discord.js";
import {
  logRepository,
  type ILogRepository,
  type LogCategory,
  type LogEventType,
  type LogUserSummary,
} from "../../repositories/logRepository.js";
import { settingsRepository } from "../../settings/repository.js";
import type { ISettingsRepository } from "../../settings/types.js";
import { LogChannelRouter } from "./LogChannelRouter.js";
import { LogEmbedFormatter } from "./LogEmbedFormatter.js";
import { LogFilterPolicy } from "./LogFilterPolicy.js";

export interface LogRecordPayload {
  title: string;
  description: string;
  details?: Record<string, string | number | boolean>;
  color?: string;
}

export interface LogSendOptions {
  category?: LogCategory;
  eventType?: LogEventType;
  channelId?: string;
  channelName?: string | null;
  user?: LogUserSummary;
  record?: LogRecordPayload;
}

export interface IAuditLogger {
  sendLog(
    target: Guild | Client,
    embed: EmbedBuilder,
    options?: LogSendOptions,
    guildIdOverride?: string
  ): Promise<void>;
}

/**
 * Dependency Inversion (DIP) & Single Responsibility (SRP) uyumlu denetim kaydı servisi.
 * Filtreleme, kanal yönlendirme, görünüm biçimlendirme ve kalıcı kayıt işlemlerini
 * bağımsız alt bileşenlere delege eder.
 */
export class AuditLoggerService implements IAuditLogger {
  constructor(
    private readonly settingsRepo: ISettingsRepository = settingsRepository,
    private readonly logRepo: ILogRepository = logRepository,
    private readonly filterPolicy: LogFilterPolicy = new LogFilterPolicy(),
    private readonly channelRouter: LogChannelRouter = new LogChannelRouter(),
    private readonly embedFormatter: LogEmbedFormatter = new LogEmbedFormatter()
  ) {}

  public async sendLog(
    target: Guild | Client,
    embed: EmbedBuilder,
    options?: LogSendOptions,
    guildIdOverride?: string
  ): Promise<void> {
    const client = target instanceof Guild ? target.client : target;
    const guildId = target instanceof Guild ? target.id : (guildIdOverride || null);

    const { logging } = this.settingsRepo.getGuildSettings(guildId);

    // 1. Filtre ve muafiyet kontrolü
    if (!this.filterPolicy.shouldProcess(logging, options)) {
      return;
    }

    // 2. Olay rengini çözümle
    const chosenColor = this.embedFormatter.resolveEventColor(
      logging.appearance,
      options?.eventType
    );

    // 3. Canlı Panel Günlüğü (Web Log Explorer) için kaydet
    if (guildId && options?.record) {
      this.logRepo.add({
        guildId,
        category: options.category || "messages",
        eventType: options.eventType || "messageDelete",
        title: options.record.title,
        description: options.record.description,
        user: options.user,
        channel: options.channelId
          ? { id: options.channelId, name: options.channelName || "kanal" }
          : undefined,
        details: options.record.details,
        color: chosenColor || options.record.color || "#FFE000",
      });
    }

    // 4. Hedef kanalı çözümle
    const destinationChannelId = this.channelRouter.resolveChannelId(logging, options?.category);
    if (!destinationChannelId) return;

    // 5. Görünüm ayarlarını embed'e uygula
    this.embedFormatter.applyAppearance(embed, logging.appearance, chosenColor);

    // 6. Discord kanalına gönder
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
}

export const auditLoggerService = new AuditLoggerService();
