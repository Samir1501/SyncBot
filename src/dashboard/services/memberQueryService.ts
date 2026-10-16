import { PermissionFlagsBits, type Guild, type GuildMember } from "discord.js";
import { memberCacheService, type IMemberCacheService } from "./memberCacheService.js";

const KEY_PERMISSION_DEFINITIONS: ReadonlyArray<{ flag: bigint; label: string }> = [
  { flag: PermissionFlagsBits.Administrator, label: "Yönetici (Admin)" },
  { flag: PermissionFlagsBits.ManageGuild, label: "Sunucuyu Yönet" },
  { flag: PermissionFlagsBits.ManageRoles, label: "Rolleri Yönet" },
  { flag: PermissionFlagsBits.ManageChannels, label: "Kanalları Yönet" },
  { flag: PermissionFlagsBits.KickMembers, label: "Üyeleri At" },
  { flag: PermissionFlagsBits.BanMembers, label: "Üyeleri Yasakla" },
  { flag: PermissionFlagsBits.ModerateMembers, label: "Zamanaşımı Uygula" },
  { flag: PermissionFlagsBits.ManageMessages, label: "Mesajları Yönet" },
  { flag: PermissionFlagsBits.MentionEveryone, label: "@everyone Etiketle" },
  { flag: PermissionFlagsBits.ViewAuditLog, label: "Denetim Kaydını Gör" },
];

/**
 * Single Responsibility (SRP): Sunucu üyelerini, rollerini, izinlerini ve özet istatistiklerini
 * panel için sorgulayan ve dönüştüren servis.
 */
export class MemberQueryService {
  constructor(private readonly memberCache: IMemberCacheService = memberCacheService) {}

  private extractKeyPermissions(member: GuildMember): string[] {
    const permissions: string[] = [];
    for (const def of KEY_PERMISSION_DEFINITIONS) {
      if (member.permissions.has(def.flag)) {
        permissions.push(def.label);
      }
    }
    return permissions;
  }

  public async getGuildMembersData(guild: Guild, forceRefresh = false) {
    await this.memberCache.ensureMembersCached(guild, forceRefresh);

    const roles = guild.roles.cache
      .filter((r) => r.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => ({
        id: r.id,
        name: r.name,
        color: r.hexColor === "#000000" ? "#9ca3af" : r.hexColor,
        position: r.position,
        memberCount: r.members.size,
        isHoisted: r.hoist,
      }));

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    let humans = 0;
    let bots = 0;
    let boosters = 0;
    let timedOut = 0;
    let inVoice = 0;
    let admins = 0;
    let recent24h = 0;
    let recent7d = 0;
    let newAccounts = 0;
    let noRoles = 0;
    let pendingCount = 0;

    const me = guild.members.me;
    const botCanModerate = Boolean(me?.permissions.has(PermissionFlagsBits.ModerateMembers));
    const botCanKick = Boolean(me?.permissions.has(PermissionFlagsBits.KickMembers));
    const botCanManageNick = Boolean(me?.permissions.has(PermissionFlagsBits.ManageNicknames));

    const membersList = [];

    for (const m of guild.members.cache.values()) {
      const isBot = m.user.bot;
      if (isBot) bots++;
      else humans++;

      const isBoosting = Boolean(m.premiumSince);
      if (isBoosting) boosters++;

      const isTimedOut = m.isCommunicationDisabled();
      if (isTimedOut) timedOut++;

      const inVoiceState = Boolean(m.voice?.channelId);
      if (inVoiceState) inVoice++;

      const isAdmin = m.permissions.has(PermissionFlagsBits.Administrator);
      if (isAdmin) admins++;

      if (m.joinedTimestamp && m.joinedTimestamp >= oneDayAgo) recent24h++;
      if (m.joinedTimestamp && m.joinedTimestamp >= sevenDaysAgo) recent7d++;
      if (m.user.createdTimestamp >= thirtyDaysAgo) newAccounts++;
      if (m.pending) pendingCount++;

      const memberRoles = m.roles.cache
        .filter((r) => r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map((r) => ({
          id: r.id,
          name: r.name,
          color: r.hexColor === "#000000" ? "#9ca3af" : r.hexColor,
          position: r.position,
        }));

      if (memberRoles.length === 0) noRoles++;

      const highestRole =
        m.roles.highest && m.roles.highest.id !== guild.id
          ? {
              id: m.roles.highest.id,
              name: m.roles.highest.name,
              color: m.roles.highest.hexColor === "#000000" ? "#9ca3af" : m.roles.highest.hexColor,
              position: m.roles.highest.position,
            }
          : null;

      const keyPermissions = this.extractKeyPermissions(m);

      membersList.push({
        id: m.id,
        username: m.user.username,
        discriminator: m.user.discriminator,
        tag: m.user.tag,
        displayName: m.displayName,
        nickname: m.nickname,
        avatarUrl: m.displayAvatarURL({ extension: "png", size: 128 }),
        bannerUrl: m.user.bannerURL({ extension: "png", size: 512 }) || null,
        isBot,
        joinedAt: m.joinedAt ? m.joinedAt.toISOString() : null,
        joinedTimestamp: m.joinedTimestamp,
        createdAt: m.user.createdAt.toISOString(),
        createdTimestamp: m.user.createdTimestamp,
        isBoosting,
        premiumSince: m.premiumSince ? m.premiumSince.toISOString() : null,
        isTimedOut,
        communicationDisabledUntil: m.communicationDisabledUntil
          ? m.communicationDisabledUntil.toISOString()
          : null,
        communicationDisabledUntilTimestamp: m.communicationDisabledUntilTimestamp,
        inVoice: inVoiceState,
        voiceChannelName: m.voice?.channel ? m.voice.channel.name : null,
        voiceChannelId: m.voice?.channelId || null,
        isAdmin,
        isMod:
          isAdmin ||
          m.permissions.has(PermissionFlagsBits.ManageGuild) ||
          m.permissions.has(PermissionFlagsBits.KickMembers) ||
          m.permissions.has(PermissionFlagsBits.BanMembers),
        pending: Boolean(m.pending),
        roles: memberRoles,
        highestRole,
        permissions: keyPermissions,
        canModerate: Boolean(botCanModerate && m.moderatable),
        canKick: Boolean(botCanKick && m.kickable),
        canManageNick: Boolean(botCanManageNick && m.manageable),
      });
    }

    return {
      guild: {
        id: guild.id,
        name: guild.name,
        icon: guild.iconURL({ extension: "png", size: 128 }),
        memberCount: guild.memberCount,
        ownerId: guild.ownerId,
      },
      roles,
      stats: {
        total: membersList.length,
        humans,
        bots,
        boosters,
        timedOut,
        inVoice,
        admins,
        recent24h,
        recent7d,
        newAccounts,
        noRoles,
        pending: pendingCount,
      },
      members: membersList,
    };
  }
}

export const memberQueryService = new MemberQueryService();
