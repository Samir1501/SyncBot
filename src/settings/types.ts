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

export interface CardBackgroundSettings {
  color: string;
  imageUrl: string;
  overlayColor: string;
  overlayOpacity: number;
}

export interface CardAvatarSettings {
  enabled: boolean;
  /** Avatarın merkez noktası */
  x: number;
  y: number;
  size: number;
  shape: "circle" | "square";
  borderColor: string;
  borderWidth: number;
}

export interface CardSettings {
  width: number;
  height: number;
  background: CardBackgroundSettings;
  avatar: CardAvatarSettings;
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

export interface LoggingEventColors {
  messageDelete?: string;
  messageUpdate?: string;
  memberJoin?: string;
  memberLeave?: string;
  memberUpdate?: string;
  voiceJoinLeave?: string;
  voiceMuteDeafen?: string;
  guildBan?: string;
}

export interface LoggingAppearance {
  detailLevel: "rich" | "compact";
  embedColor: string;
  eventColors?: LoggingEventColors;
}

export interface LoggingSettings {
  enabled: boolean;
  channelId: string;
  channels: LoggingChannels;
  events: LoggingEvents;
  filters: LoggingFilters;
  appearance: LoggingAppearance;
}

export interface WelcomeSettings {
  enabled: boolean;
  channelId: string;
  /** Kartla birlikte gönderilecek mesaj metni */
  message: string;
  card: CardSettings;
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

export interface SteamSettings {
  enabled: boolean;
  appId: string;
  channelId: string;
  mentionRoleId: string;
  checkIntervalMinutes: number;
  embedColor: string;
  lastGid: string;
}

export interface GuildSettings {
  logging: LoggingSettings;
  welcome: WelcomeSettings;
  feed: FeedSettings;
  steam: SteamSettings;
}

export type AllSettings = Record<string, GuildSettings>;

/**
 * Dependency Inversion (DIP) & Interface Segregation (ISP) için ayar deposu sözleşmesi.
 */
export interface ISettingsRepository {
  getGuildSettings(guildId?: string | null): GuildSettings;
  saveGuildSettings(guildId: string, input: unknown): GuildSettings;
}
