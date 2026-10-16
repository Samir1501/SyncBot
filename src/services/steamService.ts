import { steamBbcodeFormatter } from "./steam/SteamBbcodeFormatter.js";

export interface SteamNewsItem {
  gid: string;
  title: string;
  url: string;
  is_external_url: boolean;
  author: string;
  contents: string;
  feedlabel: string;
  date: number; // Unix timestamp in seconds
  feedname: string;
  feed_type: number;
  appid: number;
  tags?: string[];
}

export interface SteamAppDetails {
  appId: string;
  name: string;
  headerImage: string;
  storeUrl: string;
  isSuccess: boolean;
}

export interface FormattedSteamAnnouncement {
  gid: string;
  title: string;
  url: string;
  author: string;
  date: Date;
  summary: string;
  imageUrl?: string;
  gameName?: string;
}

/**
 * Single Responsibility (SRP): Steam Store ve Steam Web API HTTP istemcisi.
 */
export class SteamApiClient {
  public async fetchAppDetails(appId: string): Promise<SteamAppDetails> {
    const cleanAppId = String(appId).trim();
    const fallbackStoreUrl = `https://store.steampowered.com/app/${cleanAppId}`;
    const fallbackHeader = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${cleanAppId}/header.jpg`;

    if (!cleanAppId || !/^\d+$/.test(cleanAppId)) {
      return {
        appId: cleanAppId,
        name: "Bilinmeyen Oyun",
        headerImage: fallbackHeader,
        storeUrl: fallbackStoreUrl,
        isSuccess: false,
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(
        `https://store.steampowered.com/api/appdetails?appids=${cleanAppId}&l=turkish`,
        {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SteamNewsBot/1.0",
          },
        }
      );
      clearTimeout(timer);

      if (res.ok) {
        const data = (await res.json()) as Record<
          string,
          { success: boolean; data?: { name: string; header_image?: string } }
        >;
        const appData = data[cleanAppId];
        if (appData && appData.success && appData.data) {
          return {
            appId: cleanAppId,
            name: appData.data.name || `Steam Oyunu (${cleanAppId})`,
            headerImage: appData.data.header_image || fallbackHeader,
            storeUrl: fallbackStoreUrl,
            isSuccess: true,
          };
        }
      }
    } catch (err) {
      console.warn(`[SteamService] Oyun detayları alınamadı (AppID: ${cleanAppId}):`, err);
    }

    return {
      appId: cleanAppId,
      name: `Steam Oyunu (${cleanAppId})`,
      headerImage: fallbackHeader,
      storeUrl: fallbackStoreUrl,
      isSuccess: false,
    };
  }

  public async fetchLatestNews(appId: string, count = 5): Promise<SteamNewsItem[]> {
    const cleanAppId = String(appId).trim();
    if (!cleanAppId || !/^\d+$/.test(cleanAppId)) return [];

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);

      const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${cleanAppId}&count=${count}&feeds=steam_community_announcements`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "SteamDiscordBot/1.0",
        },
      });
      clearTimeout(timer);

      if (!res.ok) {
        console.warn(
          `[SteamService] API hatası (${res.status} ${res.statusText}) - AppID: ${cleanAppId}`
        );
        return [];
      }

      const data = (await res.json()) as { appnews?: { newsitems?: SteamNewsItem[] } };
      return data.appnews?.newsitems ?? [];
    } catch (err) {
      console.error(`[SteamService] Haberler çekilirken hata oluştu (AppID: ${cleanAppId}):`, err);
      return [];
    }
  }
}

export const steamApiClient = new SteamApiClient();

export async function fetchSteamAppDetails(appId: string): Promise<SteamAppDetails> {
  return steamApiClient.fetchAppDetails(appId);
}

export async function fetchLatestSteamNews(appId: string, count = 5): Promise<SteamNewsItem[]> {
  return steamApiClient.fetchLatestNews(appId, count);
}

export function formatSteamAnnouncement(
  item: SteamNewsItem,
  gameName?: string,
  maxLength = 1800
): FormattedSteamAnnouncement {
  return steamBbcodeFormatter.format(item, gameName, maxLength);
}
