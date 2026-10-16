import { config } from "../../config.js";
import type { LogCategory } from "../../repositories/logRepository.js";
import type { LoggingSettings } from "../../settings/types.js";

/**
 * Single Responsibility (SRP): Denetim kaydının gönderileceği hedef Discord kanal ID'sini
 * tekli veya çoklu kanal yönlendirme (Multi-Channel Routing) kurallarına göre çözümler.
 */
export class LogChannelRouter {
  public resolveChannelId(logging: LoggingSettings, category?: LogCategory): string {
    if (logging.channels?.mode === "multi" && category) {
      const catChannel = logging.channels[category];
      if (catChannel) {
        return catChannel;
      }
    }

    return logging.channels?.default || logging.channelId || config.logChannelId || "";
  }
}
