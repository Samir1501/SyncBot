import type { Client } from "discord.js";
import { settingsRepository } from "../settings/repository.js";
import type { ISettingsRepository } from "../settings/types.js";
import { steamBbcodeFormatter, type SteamBbcodeFormatter } from "./steam/SteamBbcodeFormatter.js";
import { steamDiscordNotifier, type SteamDiscordNotifier } from "./steam/SteamDiscordNotifier.js";
import { steamApiClient, type SteamApiClient } from "./steamService.js";

/**
 * Single Responsibility (SRP) & Dependency Inversion (DIP):
 * Periyodik Steam güncelleme kontrol zamanlayıcısını ve değişiklik tespitini yönetir.
 */
export class SteamWatcherService {
  private readonly lastCheckedAt = new Map<string, number>();
  private watcherInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly settingsRepo: ISettingsRepository = settingsRepository,
    private readonly apiClient: SteamApiClient = steamApiClient,
    private readonly formatter: SteamBbcodeFormatter = steamBbcodeFormatter,
    private readonly notifier: SteamDiscordNotifier = steamDiscordNotifier
  ) {}

  public async checkGuildUpdates(
    client: Client,
    guildId: string,
    forceSendLatest = false
  ): Promise<{ success: boolean; message: string }> {
    const settings = this.settingsRepo.getGuildSettings(guildId);
    const { steam } = settings;

    if (!steam?.enabled && !forceSendLatest) {
      return { success: false, message: "Steam güncelleme takibi bu sunucuda kapalı." };
    }

    if (!steam.appId || !/^\d+$/.test(steam.appId.trim())) {
      return { success: false, message: "Geçerli bir Steam App ID girilmemiş." };
    }

    if (!steam.channelId) {
      return { success: false, message: "Hedef paylaşım kanalı seçilmemiş." };
    }

    const newsItems = await this.apiClient.fetchLatestNews(steam.appId, 5);
    if (!newsItems || newsItems.length === 0) {
      return { success: false, message: "Steam'den oyun için herhangi bir duyuru bulunamadı." };
    }

    const appDetails = await this.apiClient.fetchAppDetails(steam.appId);

    if (forceSendLatest) {
      const latest = newsItems[0];
      const formatted = this.formatter.format(latest, appDetails.name);
      return await this.notifier.sendAnnouncement(
        client,
        guildId,
        formatted,
        appDetails,
        steam,
        true
      );
    }

    const currentLastGid = steam.lastGid?.trim();

    if (!currentLastGid) {
      steam.lastGid = newsItems[0].gid;
      this.settingsRepo.saveGuildSettings(guildId, settings);
      return {
        success: true,
        message: `Mevcut son duyuru kaydedildi (GID: ${newsItems[0].gid}). Gelecek yeni güncellemeler otomatik paylaşılacak.`,
      };
    }

    const sorted = [...newsItems].sort((a, b) => a.date - b.date);
    const lastIndex = sorted.findIndex((item) => item.gid === currentLastGid);
    let newAnnouncements = lastIndex >= 0 ? sorted.slice(lastIndex + 1) : [];

    if (lastIndex === -1 && sorted.length > 0) {
      newAnnouncements = [sorted[sorted.length - 1]];
    }

    if (newAnnouncements.length === 0) {
      return { success: true, message: "Yeni bir güncelleme bulunmuyor." };
    }

    let sentCount = 0;
    for (const item of newAnnouncements) {
      const formatted = this.formatter.format(item, appDetails.name);
      const result = await this.notifier.sendAnnouncement(
        client,
        guildId,
        formatted,
        appDetails,
        steam,
        false
      );
      if (result.success) {
        sentCount++;
        steam.lastGid = item.gid;
        this.settingsRepo.saveGuildSettings(guildId, settings);
      }
    }

    return {
      success: true,
      message: `${sentCount} yeni güncelleme notu başarıyla paylaşıldı.`,
    };
  }

  public start(client: Client): void {
    this.stop();

    console.log("🎮 [SteamWatcher] Steam oyun güncelleme takip servisi başlatıldı.");

    this.watcherInterval = setInterval(async () => {
      const now = Date.now();

      for (const guild of client.guilds.cache.values()) {
        const settings = this.settingsRepo.getGuildSettings(guild.id);
        if (!settings.steam?.enabled || !settings.steam.appId || !settings.steam.channelId) {
          continue;
        }

        const intervalMs = (settings.steam.checkIntervalMinutes || 10) * 60 * 1000;
        const lastCheck = this.lastCheckedAt.get(guild.id) ?? 0;

        if (now - lastCheck >= intervalMs) {
          this.lastCheckedAt.set(guild.id, now);
          try {
            await this.checkGuildUpdates(client, guild.id, false);
          } catch (err) {
            console.error(
              `[SteamWatcher] ${guild.name} için güncelleme kontrolü sırasında hata:`,
              err
            );
          }
        }
      }
    }, 60 * 1000);

    this.watcherInterval.unref();
  }

  public stop(): void {
    if (this.watcherInterval) {
      clearInterval(this.watcherInterval);
      this.watcherInterval = null;
      console.log("🛑 [SteamWatcher] Servis durduruldu.");
    }
  }
}

export const steamWatcherService = new SteamWatcherService();

export async function checkGuildSteamUpdates(
  client: Client,
  guildId: string,
  forceSendLatest = false
): Promise<{ success: boolean; message: string }> {
  return steamWatcherService.checkGuildUpdates(client, guildId, forceSendLatest);
}

export function startSteamWatcher(client: Client): void {
  steamWatcherService.start(client);
}

export function stopSteamWatcher(): void {
  steamWatcherService.stop();
}
