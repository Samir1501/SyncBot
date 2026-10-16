import { defaultSettings } from "./defaults.js";
import type { GuildSettings, LoggingEventColors, TextLayer } from "./types.js";

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergeWithDefaults<T>(defaults: T, input: unknown): T {
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

export function sanitizeTextLayer(layer: unknown, index: number): TextLayer {
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
  if (!merged.logging.appearance.eventColors || typeof merged.logging.appearance.eventColors !== "object") {
    merged.logging.appearance.eventColors = { ...defaultSettings.logging.appearance.eventColors };
  } else {
    for (const key of Object.keys(defaultSettings.logging.appearance.eventColors!)) {
      const k = key as keyof LoggingEventColors;
      if (!merged.logging.appearance.eventColors[k] || typeof merged.logging.appearance.eventColors[k] !== "string") {
        merged.logging.appearance.eventColors[k] = defaultSettings.logging.appearance.eventColors![k];
      }
    }
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

  // Steam sanitization
  if (!merged.steam || typeof merged.steam !== "object") {
    merged.steam = { ...defaultSettings.steam };
  } else {
    merged.steam.enabled = Boolean(merged.steam.enabled);
    merged.steam.appId = String(merged.steam.appId || "").trim();
    merged.steam.channelId = String(merged.steam.channelId || "").trim();
    merged.steam.mentionRoleId = String(merged.steam.mentionRoleId || "").trim();
    merged.steam.checkIntervalMinutes = Math.min(
      Math.max(Math.round(Number(merged.steam.checkIntervalMinutes) || 10), 2),
      1440
    );
    if (!merged.steam.embedColor || typeof merged.steam.embedColor !== "string") {
      merged.steam.embedColor = "#1b2838";
    }
    merged.steam.lastGid = String(merged.steam.lastGid || "").trim();
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
