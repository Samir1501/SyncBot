import path from "node:path";
import type { GuildSettings } from "./types.js";

export const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
export const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

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
      eventColors: {
        messageDelete: "#EF4444",
        messageUpdate: "#F59E0B",
        memberJoin: "#10B981",
        memberLeave: "#F43F5E",
        memberUpdate: "#38BDF8",
        voiceJoinLeave: "#A855F7",
        voiceMuteDeafen: "#F97316",
        guildBan: "#DC2626",
      },
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
  steam: {
    enabled: false,
    appId: "",
    channelId: "",
    mentionRoleId: "",
    checkIntervalMinutes: 10,
    embedColor: "#1b2838",
    lastGid: "",
  },
};
