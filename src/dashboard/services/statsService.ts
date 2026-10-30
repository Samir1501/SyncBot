import os from "node:os";
import { ChannelType, version as djsVersion, type Client } from "discord.js";
import { activityRepository, type IActivityRepository } from "../../repositories/activityRepository.js";
import { logRepository, type ILogRepository } from "../../repositories/logRepository.js";
import { settingsRepository } from "../../settings/repository.js";
import type { ISettingsRepository } from "../../settings/types.js";
import type { CardData } from "../../welcome/cardRenderer.js";
import { memberCacheService, type IMemberCacheService } from "./memberCacheService.js";

/**
 * Single Responsibility (SRP): Sunucu ve bot istatistiklerini hesaplayan servis.
 */
export class StatsService {
  constructor(
    private readonly settingsRepo: ISettingsRepository = settingsRepository,
    private readonly activityRepo: IActivityRepository = activityRepository,
    private readonly logRepo: ILogRepository = logRepository,
    private readonly memberCache: IMemberCacheService = memberCacheService
  ) {}

  public getSampleCardData(client: Client, guildId?: string): CardData {
    const guild = (guildId ? client.guilds.cache.get(guildId) : null) || client.guilds.cache.first();
    return {
      username: client.user?.username ?? "Kullanıcı",
      displayName: client.user?.displayName ?? "Kullanıcı",
      avatarUrl: client.user?.displayAvatarURL({ extension: "png", size: 512 }) ?? "",
      serverName: guild?.name ?? "Sunucu",
      memberCount: guild?.memberCount ?? 100,
    };
  }

  public async getDashboardStats(client: Client, guildId?: string) {
    const guild = (guildId ? client.guilds.cache.get(guildId) : null) || client.guilds.cache.first();
    const settings = this.settingsRepo.getGuildSettings(guildId || null);

    const textChannelsCount =
      guild?.channels.cache.filter(
        (c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement
      ).size || 0;
    const voiceChannelsCount =
      guild?.channels.cache.filter(
        (c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice
      ).size || 0;
    const categoriesCount =
      guild?.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).size || 0;
    const forumChannelsCount =
      guild?.channels.cache.filter(
        (c) => c.type === ChannelType.GuildForum || c.type === ChannelType.GuildMedia
      ).size || 0;
    const announcementChannelsCount =
      guild?.channels.cache.filter((c) => c.type === ChannelType.GuildAnnouncement).size || 0;
    const stageChannelsCount =
      guild?.channels.cache.filter((c) => c.type === ChannelType.GuildStageVoice).size || 0;
    const threadChannelsCount =
      guild?.channels.cache.filter((c) => c.isThread()).size || 0;
    const totalChannelsCount =
      (guild?.channels.cache.size || 0) + threadChannelsCount;

    const rolesCount = guild?.roles.cache.size || 0;

    if (guild) {
      await this.memberCache.ensureMembersCached(guild);
    }

    let botCount = 0;
    let humanCount = 0;
    let activeVoiceMembersCount = 0;
    let timedOutMembersCount = 0;

    if (guild) {
      botCount = guild.members.cache.filter((m) => m.user.bot).size;
      humanCount = guild.members.cache.filter((m) => !m.user.bot).size;
      if (humanCount + botCount < guild.memberCount) {
        humanCount = Math.max(0, guild.memberCount - botCount);
      }
      activeVoiceMembersCount = guild.members.cache.filter((m) => Boolean(m.voice?.channelId)).size;
      timedOutMembersCount = guild.members.cache.filter(
        (m) => Boolean(m.communicationDisabledUntilTimestamp && m.communicationDisabledUntilTimestamp > Date.now())
      ).size;
    }

    // Emojiler & Çıkartmalar
    const emojisCount = guild?.emojis.cache.size || 0;
    const animatedEmojisCount = guild?.emojis.cache.filter((e) => Boolean(e.animated)).size || 0;
    const staticEmojisCount = emojisCount - animatedEmojisCount;
    const stickersCount = guild?.stickers.cache.size || 0;

    let ownerInfo = null;
    if (guild) {
      try {
        const ownerUser =
          client.users.cache.get(guild.ownerId) ||
          (await guild.fetchOwner().catch(() => null))?.user;
        if (ownerUser) {
          ownerInfo = {
            id: ownerUser.id,
            username: ownerUser.username,
            tag: ownerUser.tag,
            avatarUrl: ownerUser.displayAvatarURL({ extension: "png", size: 128 }),
          };
        }
      } catch {
        // Sahip bilgisi alınamazsa boş geç
      }
    }

    const recentMembers = guild
      ? guild.members.cache
          .filter((m) => !m.user.bot)
          .sort((a, b) => (b.joinedTimestamp || 0) - (a.joinedTimestamp || 0))
          .first(6)
          .map((m) => ({
            id: m.id,
            username: m.user.username,
            displayName: m.displayName,
            avatarUrl: m.user.displayAvatarURL({ extension: "png", size: 64 }),
            joinedAt: m.joinedAt ? m.joinedAt.toISOString() : null,
          }))
      : [];

    // En popüler roller (üye sayısına göre ilk 8)
    const topRoles = guild
      ? guild.roles.cache
          .filter((r) => r.id !== guild.id)
          .sort((a, b) => b.members.size - a.members.size)
          .first(8)
          .map((r) => ({
            id: r.id,
            name: r.name,
            color: r.hexColor !== "#000000" ? r.hexColor : "#99aab5",
            memberCount: r.members.size,
          }))
      : [];

    // En kalabalık ses kanalları
    const activeVoiceChannels = guild
      ? guild.channels.cache
          .filter((c) => c.isVoiceBased() && "members" in c && (c as any).members?.size > 0)
          .map((c) => ({
            id: c.id,
            name: c.name,
            userCount: Number((c as any).members?.size || 0),
          }))
          .sort((a, b) => b.userCount - a.userCount)
          .slice(0, 6)
      : [];

    const boostTier = guild?.premiumTier || 0;
    const boostCount = guild?.premiumSubscriptionCount || 0;
    const nextTierTarget = boostTier === 0 ? 2 : boostTier === 1 ? 7 : boostTier === 2 ? 14 : 14;

    const totalLogsCount = guild ? this.logRepo.query({ guildId: guild.id }).length : 0;

    const totalMem = Math.round(os.totalmem() / 1024 / 1024);
    const usedMem = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const memPercent = Math.min(100, Math.round((usedMem / totalMem) * 100));

    return {
      bot: {
        username: client.user?.username || "Bot",
        tag: client.user?.tag || "Bot",
        avatarUrl: client.user?.displayAvatarURL({ extension: "png", size: 256 }) || "",
        ready: client.isReady(),
        ping: Math.round(client.ws.ping) || 0,
        uptimeSeconds: Math.floor(process.uptime()),
        totalGuilds: client.guilds.cache.size,
        totalUsers: client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0),
        memoryMB: usedMem,
        memoryTotalMB: totalMem,
        memoryPercent: memPercent,
        nodeVersion: process.version,
        djsVersion,
        platform: process.platform === "win32" ? "Windows" : process.platform,
      },
      guild: guild
        ? {
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL({ extension: "png", size: 256 }),
            banner: guild.bannerURL({ size: 1024 }),
            splash: guild.splashURL({ size: 1024 }),
            description: guild.description || null,
            vanityURLCode: guild.vanityURLCode || null,
            features: guild.features || [],
            memberCount: guild.memberCount,
            humanCount,
            botCount,
            activeVoiceMembersCount,
            timedOutMembersCount,
            textChannelsCount,
            voiceChannelsCount,
            categoriesCount,
            forumChannelsCount,
            announcementChannelsCount,
            stageChannelsCount,
            threadChannelsCount,
            totalChannelsCount,
            rolesCount,
            emojisCount,
            staticEmojisCount,
            animatedEmojisCount,
            stickersCount,
            totalLogsCount,
            createdAt:
              guild.createdAt && !isNaN(guild.createdAt.getTime())
                ? guild.createdAt.toISOString()
                : new Date().toISOString(),
            joinedAt:
              guild.joinedAt && !isNaN(guild.joinedAt.getTime())
                ? guild.joinedAt.toISOString()
                : null,
            verificationLevel: guild.verificationLevel,
            explicitContentFilter: guild.explicitContentFilter,
            boostTier,
            boostCount,
            nextTierTarget,
            owner: ownerInfo,
            recentMembers,
            topRoles,
            activeVoiceChannels,
            loggingEnabled: settings.logging.enabled,
            loggingChannelId: settings.logging.channelId,
            welcomeEnabled: settings.welcome.enabled,
            welcomeChannelId: settings.welcome.channelId,
            feedEnabled: settings.feed?.enabled || false,
            feedTargetChannelId: settings.feed?.targetChannelId || "",
            steamEnabled: settings.steam?.enabled || false,
            steamAppId: settings.steam?.appId || "",
            steamChannelId: settings.steam?.channelId || "",
          }
        : null,
      activities: this.activityRepo.getRecent(guild?.id),
    };
  }
}

export const statsService = new StatsService();
