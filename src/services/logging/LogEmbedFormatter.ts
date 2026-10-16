import type { EmbedBuilder } from "discord.js";
import type { LogEventType } from "../../repositories/logRepository.js";
import type { LoggingAppearance } from "../../settings/types.js";

/**
 * Single Responsibility (SRP): Denetim kaydı embedlerinin renk ve görünüm (rich/compact)
 * biçimlendirmesini uygular.
 */
export class LogEmbedFormatter {
  public resolveEventColor(appearance: LoggingAppearance | undefined, eventType?: LogEventType): string {
    let chosenColor = appearance?.embedColor || "#FFE000";
    if (
      eventType &&
      appearance?.eventColors &&
      (appearance.eventColors as Record<string, string>)[eventType]
    ) {
      chosenColor = (appearance.eventColors as Record<string, string>)[eventType];
    }
    return chosenColor;
  }

  public applyAppearance(
    embed: EmbedBuilder,
    appearance: LoggingAppearance | undefined,
    chosenColor: string
  ): void {
    if (appearance?.detailLevel === "compact") {
      embed.setImage(null);
    }

    if (chosenColor && chosenColor.startsWith("#")) {
      const rawHex = chosenColor.replace("#", "");
      const hexNum = parseInt(rawHex, 16);
      if (!isNaN(hexNum)) {
        embed.setColor(hexNum);
      }
    }
  }
}
