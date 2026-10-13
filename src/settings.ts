import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

export interface TextLayer {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily?: string;
  color: string;
  fontWeight: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  underline?: boolean;
  uppercase?: boolean;
  align: "left" | "center" | "right";
  shadow: boolean;
  stroke?: boolean;
  strokeColor?: string;
  strokeWidth?: number;
}

export interface CardSettings {
  width: number;
  height: number;
  background: {
    color: string;
    imageUrl: string;
    overlayColor: string;
    overlayOpacity: number;
  };
  avatar: {
    enabled: boolean;
    /** Avatarın merkez noktası */
    x: number;
    y: number;
    size: number;
    shape: "circle" | "square";
    borderColor: string;
    borderWidth: number;
  };
  texts: TextLayer[];
}

export interface LoggingChannels {
  mode: "single" | "multi";
  default: string;
  messages: string;
  members: string;
  voice: string;
  moderation: string;
}

export interface LoggingEvents {
  messageDelete: boolean;
  messageUpdate: boolean;
  memberJoin: boolean;
  memberLeave: boolean;
  memberUpdate: boolean;
  voiceJoinLeave: boolean;
  voiceMuteDeafen: boolean;
  guildBan: boolean;
}

export interface LoggingFilters {
  ignoreBots: boolean;
  ignoredChannels: string[];
}

export interface LoggingAppearance {
  detailLevel: "rich" | "compact";
  embedColor: string;
}

export interface FeedSettings {
  enabled: boolean;
  targetChannelId: string;
  sourceChannelIds: string[];
  previewLength: number;
  minContentLength: number;
  ignoreBots: boolean;
  includeImages: boolean;
  embedColor: string;
}

export interface GuildSettings {
  logging: {
    enabled: boolean;
    channelId: string;
    channels: LoggingChannels;
    events: LoggingEvents;
    filters: LoggingFilters;
    appearance: LoggingAppearance;
  };
  welcome: {
    enabled: boolean;
    channelId: string;
    /** Kartla birlikte gönderilecek mesaj metni */
    message: string;
    card: CardSettings;
  };
  feed: FeedSettings;
}

export type AllSettings = Record<string, GuildSettings>;

export const defaultSettings: GuildSettings = {
  logging: {
    enabled: true,
    channelId: "",
    channels: {
      mode: "single",
      default: "",
      messages: "",
      members: "",
      voice: "",
      moderation: "",
    },
    events: {
      messageDelete: true,
      messageUpdate: true,
      memberJoin: true,
      memberLeave: true,
      memberUpdate: true,
      voiceJoinLeave: true,
      voiceMuteDeafen: true,
      guildBan: true,
    },
    filters: {
      ignoreBots: true,
      ignoredChannels: [],
    },
    appearance: {
      detailLevel: "rich",
      embedColor: "#FFE000",
    },
  },
  welcome: {
    enabled: false,
    channelId: "",
    message: "Hoş geldin {mention}! 🎉",
    card: {
      width: 1024,
      height: 450,
      background: {
        color: "#2b2d31",
        imageUrl: "",
        overlayColor: "#000000",
        overlayOpacity: 0.3,
      },
      avatar: {
        enabled: true,
        x: 512,
        y: 160,
        size: 180,
        shape: "circle",
        borderColor: "#ffffff",
        borderWidth: 6,
      },
      texts: [
        { id: "title", text: "HOŞ GELDİN", x: 512, y: 300, fontSize: 52, color: "#ffffff", fontWeight: "bold", align: "center", shadow: true },
        { id: "username", text: "{username}", x: 512, y: 360, fontSize: 36, color: "#ffffff", fontWeight: "normal", align: "center", shadow: true },
        { id: "count", text: "{memberCount}. üyemizsin!", x: 512, y: 405, fontSize: 24, color: "#b5bac1", fontWeight: "normal", align: "center", shadow: false },
      ],
    },
  },
  feed: {
    enabled: false,
    targetChannelId: "",
    sourceChannelIds: [],
    previewLength: 200,
    minContentLength: 1,
    ignoreBots: true,
    includeImages: true,
    embedColor: "#FFE000",
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeWithDefaults<T>(defaults: T, input: unknown): T {
  if (isPlainObject(defaults)) {
    const source = isPlainObject(input) ? input : {};
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(defaults)) {
      result[key] = mergeWithDefaults((defaults as Record<string, unknown>)[key], source[key]);
    }
    return result as T;
  }
  if (Array.isArray(defaults)) {
    return (Array.isArray(input) ? input : defaults) as T;
  }
  return (typeof input === typeof defaults ? input : defaults) as T;
}

function sanitizeTextLayer(layer: unknown, index: number): TextLayer {
  const template: TextLayer = {
    id: `text-${index}`,
    text: "",
    x: 0,
    y: 0,
    fontSize: 32,
    color: "#ffffff",
    fontWeight: "normal",
    align: "center",
    shadow: false,
  };
  const merged = mergeWithDefaults(template, layer);
  if (!["normal", "bold"].includes(merged.fontWeight)) merged.fontWeight = "normal";
  if (!["left", "center", "right"].includes(merged.align)) merged.align = "center";
  merged.fontSize = Math.min(Math.max(merged.fontSize, 8), 200);
  return merged;
}

export function sanitizeGuildSettings(input: unknown): GuildSettings {
  const merged = mergeWithDefaults(defaultSettings, input);

  // Logging sanitization & backward compatibility sync
  if (!["single", "multi"].includes(merged.logging.channels?.mode)) {
    merged.logging.channels.mode = "single";
  }
  if (!Array.isArray(merged.logging.filters?.ignoredChannels)) {
    merged.logging.filters.ignoredChannels = [];
  }
  if (!["rich", "compact"].includes(merged.logging.appearance?.detailLevel)) {
    merged.logging.appearance.detailLevel = "rich";
  }
  // Sync channelId and channels.default
  if (merged.logging.channelId && !merged.logging.channels.default) {
    merged.logging.channels.default = merged.logging.channelId;
  } else if (merged.logging.channels.default && !merged.logging.channelId) {
    merged.logging.channelId = merged.logging.channels.default;
  }

  // Feed sanitization
  if (!Array.isArray(merged.feed?.sourceChannelIds)) {
    merged.feed.sourceChannelIds = [];
  }
  merged.feed.previewLength = Math.min(Math.max(Math.round(Number(merged.feed.previewLength) || 200), 50), 1000);
  merged.feed.minContentLength = Math.min(Math.max(Math.round(typeof merged.feed.minContentLength === "number" ? merged.feed.minContentLength : 1), 0), 200);
  if (!merged.feed.embedColor || typeof merged.feed.embedColor !== "string") {
    merged.feed.embedColor = "#FFE000";
  }

  const card = merged.welcome.card;
  card.width = Math.min(Math.max(Math.round(card.width), 200), 2000);
  card.height = Math.min(Math.max(Math.round(card.height), 100), 1200);
  card.background.overlayOpacity = Math.min(Math.max(card.background.overlayOpacity, 0), 1);
  card.avatar.size = Math.min(Math.max(card.avatar.size, 16), 1000);
  card.avatar.borderWidth = Math.min(Math.max(card.avatar.borderWidth, 0), 50);
  if (!["circle", "square"].includes(card.avatar.shape)) card.avatar.shape = "circle";
  card.texts = card.texts.slice(0, 20).map(sanitizeTextLayer);
  return merged;
}

let store: AllSettings = loadFromDisk();

function loadFromDisk(): AllSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
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

function persistToDisk(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(store, null, 2), "utf-8");
}

/**
 * Belirtilen sunucunun ayarlarını getirir.
 * Eğer sunucuya özel ayar henüz kaydedilmemişse, varsayılan/default şablonu kopyalayarak döner.
 */
export function getGuildSettings(guildId?: string | null): GuildSettings {
  if (guildId && store[guildId]) {
    return store[guildId];
  }
  // Eğer henüz bu guildId yoksa ama "default" ayarımız varsa onu baz al
  if (store.default) {
    return structuredClone(store.default);
  }
  return structuredClone(defaultSettings);
}

/**
 * Belirtilen sunucunun ayarlarını günceller ve kaydeder.
 */
export function saveGuildSettings(guildId: string, input: unknown): GuildSettings {
  const sanitized = sanitizeGuildSettings(input);
  store[guildId] = sanitized;
  persistToDisk();
  return sanitized;
}

/** Geriye dönük uyumluluk için alias */
export const getSettings = (guildId?: string) => getGuildSettings(guildId);
