export * from "./settings/types.js";
export * from "./settings/defaults.js";
export * from "./settings/sanitizer.js";
export * from "./settings/repository.js";

import { settingsRepository } from "./settings/repository.js";
import type { GuildSettings } from "./settings/types.js";

/**
 * Belirtilen sunucunun ayarlarını getirir.
 * Eğer sunucuya özel ayar henüz kaydedilmemişse, varsayılan/default şablonu döner.
 */
export function getGuildSettings(guildId?: string | null): GuildSettings {
  return settingsRepository.getGuildSettings(guildId);
}

/**
 * Belirtilen sunucunun ayarlarını günceller ve kaydeder.
 */
export function saveGuildSettings(guildId: string, input: unknown): GuildSettings {
  return settingsRepository.saveGuildSettings(guildId, input);
}

/** Geriye dönük uyumluluk için alias */
export const getSettings = (guildId?: string) => getGuildSettings(guildId);
