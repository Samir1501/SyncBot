import type { LogEventType, LogUserSummary } from "../../repositories/logRepository.js";
import type { LoggingSettings } from "../../settings/types.js";

export interface LogFilterContext {
  eventType?: LogEventType;
  channelId?: string;
  user?: LogUserSummary;
}

/**
 * Single Responsibility (SRP): Bir denetim kaydının (log) işlenip işlenmeyeceğine
 * sunucu filtre ve muafiyet kurallarına göre karar verir.
 */
export class LogFilterPolicy {
  public shouldProcess(logging: LoggingSettings, context?: LogFilterContext): boolean {
    if (!logging.enabled) return false;

    // 1. Olay Bazlı Filtre Kontrolü
    if (context?.eventType && logging.events && logging.events[context.eventType] === false) {
      return false;
    }

    // 2. Akıllı Muafiyetler: Botları Yoksay
    if (context?.user?.isBot && logging.filters?.ignoreBots) {
      return false;
    }

    // 3. Akıllı Muafiyetler: Yoksayılan Kanallar
    if (context?.channelId && logging.filters?.ignoredChannels?.includes(context.channelId)) {
      return false;
    }

    return true;
  }
}
