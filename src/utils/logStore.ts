export * from "../repositories/logRepository.js";
import { logRepository, type LogQueryOptions, type LogRecord } from "../repositories/logRepository.js";

/** Bekleyen log kayıtlarını hemen diske yazar (bot kapanırken çağrılır) */
export function flushLogStore(): void {
  logRepository.flush();
}

/**
 * Yeni bir denetim kaydını hafıza kuyruğuna ekler ve diske kalıcı olarak kaydeder.
 */
export function addLogRecord(record: Omit<LogRecord, "id" | "timestamp">): LogRecord {
  return logRepository.add(record);
}

/**
 * Denetim kayıtlarını filtrelere ve arama kriterlerine göre sorgular.
 */
export function queryLogs(options: LogQueryOptions = {}): LogRecord[] {
  return logRepository.query(options);
}

/**
 * Sunucuya veya genel belleğe ait kayıtları temizler ve diski günceller.
 */
export function clearLogs(guildId?: string): void {
  logRepository.clear(guildId);
}
