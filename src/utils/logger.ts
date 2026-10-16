export * from "../services/logging/AuditLoggerService.js";
export * from "../services/logging/LogChannelRouter.js";
export * from "../services/logging/LogEmbedFormatter.js";
export * from "../services/logging/LogFilterPolicy.js";

import type { Client, EmbedBuilder, Guild } from "discord.js";
import { auditLoggerService, type LogSendOptions } from "../services/logging/AuditLoggerService.js";

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
  return auditLoggerService.sendLog(target, embed, options, guildIdOverride);
}
