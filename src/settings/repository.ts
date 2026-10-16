import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, defaultSettings, SETTINGS_FILE } from "./defaults.js";
import { isPlainObject, sanitizeGuildSettings } from "./sanitizer.js";
import type { AllSettings, GuildSettings, ISettingsRepository } from "./types.js";

/**
 * Dosya tabanlı sunucu ayarları deposu (Single Responsibility: yalnızca okuma/yazma ve önbellek yönetimi).
 */
export class FileSettingsRepository implements ISettingsRepository {
  private store: AllSettings;
  private fallbackCache: GuildSettings | null = null;
  private readonly filePath: string;

  constructor(filePath: string = SETTINGS_FILE) {
    this.filePath = filePath;
    this.store = this.loadFromDisk();
  }

  private loadFromDisk(): AllSettings {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
        // Eski tek sunuculu formattan çok sunuculu formata otomatik geçiş kontrolü
        if (raw && (raw.logging !== undefined || raw.welcome !== undefined)) {
          return { default: sanitizeGuildSettings(raw) };
        }
        if (isPlainObject(raw)) {
          const result: AllSettings = {};
          for (const [guildId, val] of Object.entries(raw)) {
            result[guildId] = sanitizeGuildSettings(val);
          }
          return result;
        }
      }
    } catch (error) {
      console.error("[Ayarlar] settings.json okunamadı, varsayılanlar kullanılıyor:", error);
    }
    return {};
  }

  private persistToDisk(): void {
    fs.mkdirSync(path.dirname(this.filePath) || DATA_DIR, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), "utf-8");
  }

  public getGuildSettings(guildId?: string | null): GuildSettings {
    if (guildId && this.store[guildId]) {
      return this.store[guildId];
    }
    if (!this.fallbackCache) {
      this.fallbackCache = structuredClone(this.store.default ?? defaultSettings);
    }
    return this.fallbackCache;
  }

  public saveGuildSettings(guildId: string, input: unknown): GuildSettings {
    const sanitized = sanitizeGuildSettings(input);
    this.store[guildId] = sanitized;
    if (guildId === "default") {
      this.fallbackCache = null;
    }
    this.persistToDisk();
    return sanitized;
  }
}

export const settingsRepository = new FileSettingsRepository();
