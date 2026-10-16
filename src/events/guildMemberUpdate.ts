import {
  AuditLogEvent,
  Colors,
  EmbedBuilder,
  GuildMember,
  PartialGuildMember,
} from "discord.js";
import type { LogUserSummary } from "../repositories/logRepository.js";
import { auditLoggerService, type IAuditLogger } from "../services/logging/AuditLoggerService.js";

export interface IMemberUpdateStrategy {
  /**
   * Değişikliği kontrol eder ve işler.
   * Eşleşme sağlanıp loglandıysa `true`, aksi halde `false` döner.
   */
   tryHandle(
    oldMember: GuildMember,
    newMember: GuildMember,
    user: LogUserSummary,
    logger: IAuditLogger
  ): Promise<boolean>;
}

function createBaseMemberEmbed(newMember: GuildMember): EmbedBuilder {
  return new EmbedBuilder()
    .setAuthor({
      name: `${newMember.user.tag} (${newMember.user.id})`,
      iconURL: newMember.user.displayAvatarURL(),
    })
    .setTimestamp();
}

export class NicknameUpdateStrategy implements IMemberUpdateStrategy {
  public async tryHandle(
    oldMember: GuildMember,
    newMember: GuildMember,
    user: LogUserSummary,
    logger: IAuditLogger
  ): Promise<boolean> {
    if (oldMember.nickname === newMember.nickname) return false;

    const oldNick = oldMember.nickname || "*Yok (Orijinal Ad)*";
    const newNick = newMember.nickname || "*Sıfırlandı*";
    const embed = createBaseMemberEmbed(newMember)
      .setColor(Colors.Blue)
      .setTitle("🏷️ Takma Ad Değiştirildi")
      .addFields(
        { name: "Kullanıcı", value: `<@${newMember.id}>`, inline: true },
        { name: "Eski Takma Ad", value: oldNick, inline: true },
        { name: "Yeni Takma Ad", value: newNick, inline: true }
      );

    await logger.sendLog(newMember.guild, embed, {
      category: "members",
      eventType: "memberUpdate",
      user,
      record: {
        title: "Takma Ad Değiştirildi",
        description: `${newMember.user.tag} takma adını değiştirdi: ${oldNick} ➔ ${newNick}`,
        details: { oldNick, newNick },
        color: "#3b82f6",
      },
    });
    return true;
  }
}

export class RoleUpdateStrategy implements IMemberUpdateStrategy {
  public async tryHandle(
    oldMember: GuildMember,
    newMember: GuildMember,
    user: LogUserSummary,
    logger: IAuditLogger
  ): Promise<boolean> {
    const isOldRoleCacheSuspicious =
      oldMember.roles.cache.size <= 1 && newMember.roles.cache.size > 2;

    const addedRoles = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
    const removedRoles = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));

    if (addedRoles.size === 0 && removedRoles.size === 0) return false;

    const embed = createBaseMemberEmbed(newMember);
    let executorTag = "";
    let isVerifiedRecentChange = false;

    try {
      const auditLogs = await newMember.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberRoleUpdate,
        limit: 1,
      });
      const entry = auditLogs.entries.first();

      if (entry && entry.targetId === newMember.id) {
        const timeDiff = Date.now() - entry.createdTimestamp;
        if (timeDiff < 20000) {
          isVerifiedRecentChange = true;
          if (entry.executor) {
            executorTag = entry.executor.tag || "";
            embed.addFields({
              name: "İşlemi Yapan Yetkili",
              value: `<@${entry.executor.id}> (\`${entry.executor.tag || entry.executor.username}\`)`,
              inline: true,
            });
          }
        }
      }
    } catch {
      isVerifiedRecentChange = !isOldRoleCacheSuspicious;
    }

    if (isOldRoleCacheSuspicious && !isVerifiedRecentChange) {
      console.log(
        `[Log Guard] ${newMember.user.tag} için önbellek kaynaklı eski rol atama olayı engellendi.`
      );
      return true;
    }

    if (addedRoles.size > 0) {
      const roleNames = addedRoles.map((r) => r.name).join(", ");
      embed
        .setColor(Colors.Green)
        .setTitle("🛡️ Üyeye Rol Verildi")
        .addFields(
          { name: "Kullanıcı", value: `<@${newMember.id}>`, inline: true },
          {
            name: "Eklenen Rol(ler)",
            value: addedRoles.map((r) => `<@&${r.id}>`).join(", "),
            inline: false,
          }
        );

      await logger.sendLog(newMember.guild, embed, {
        category: "members",
        eventType: "memberUpdate",
        user,
        record: {
          title: "Üyeye Rol Verildi",
          description: `${newMember.user.tag} kullanıcısına rol verildi: ${roleNames}${executorTag ? ` (Yetkili: ${executorTag})` : ""}`,
          details: { roles: roleNames, executor: executorTag || "Bilinmiyor" },
          color: "#22c55e",
        },
      });
      return true;
    }

    if (removedRoles.size > 0) {
      const roleNames = removedRoles.map((r) => r.name).join(", ");
      embed
        .setColor(Colors.Orange)
        .setTitle("🛡️ Üyeden Rol Alındı")
        .addFields(
          { name: "Kullanıcı", value: `<@${newMember.id}>`, inline: true },
          {
            name: "Alınan Rol(ler)",
            value: removedRoles.map((r) => `<@&${r.id}>`).join(", "),
            inline: false,
          }
        );

      await logger.sendLog(newMember.guild, embed, {
        category: "members",
        eventType: "memberUpdate",
        user,
        record: {
          title: "Üyeden Rol Alındı",
          description: `${newMember.user.tag} kullanıcısından rol alındı: ${roleNames}${executorTag ? ` (Yetkili: ${executorTag})` : ""}`,
          details: { roles: roleNames, executor: executorTag || "Bilinmiyor" },
          color: "#f97316",
        },
      });
      return true;
    }

    return false;
  }
}

export class TimeoutUpdateStrategy implements IMemberUpdateStrategy {
  public async tryHandle(
    oldMember: GuildMember,
    newMember: GuildMember,
    user: LogUserSummary,
    logger: IAuditLogger
  ): Promise<boolean> {
    if (
      oldMember.communicationDisabledUntilTimestamp ===
      newMember.communicationDisabledUntilTimestamp
    ) {
      return false;
    }

    const embed = createBaseMemberEmbed(newMember);

    if (newMember.communicationDisabledUntilTimestamp && newMember.isCommunicationDisabled()) {
      const timeoutDateUnix = Math.floor(newMember.communicationDisabledUntilTimestamp / 1000);
      embed
        .setColor(Colors.Red)
        .setTitle("⏳ Üyeye Zaman Aşımı (Timeout) Uygulandı")
        .addFields(
          { name: "Kullanıcı", value: `<@${newMember.id}>`, inline: true },
          {
            name: "Bitiş Tarihi",
            value: `<t:${timeoutDateUnix}:F> (<t:${timeoutDateUnix}:R>)`,
            inline: false,
          }
        );

      await logger.sendLog(newMember.guild, embed, {
        category: "moderation",
        eventType: "memberUpdate",
        user,
        record: {
          title: "Zaman Aşımı Uygulandı",
          description: `${newMember.user.tag} kullanıcısına zaman aşımı (timeout) uygulandı`,
          details: {
            expiresAt: new Date(newMember.communicationDisabledUntilTimestamp).toISOString(),
          },
          color: "#ef4444",
        },
      });
      return true;
    }

    if (oldMember.communicationDisabledUntilTimestamp && !newMember.isCommunicationDisabled()) {
      embed
        .setColor(Colors.Green)
        .setTitle("🔓 Zaman Aşımı (Timeout) Kaldırıldı")
        .addFields({ name: "Kullanıcı", value: `<@${newMember.id}>`, inline: true });

      await logger.sendLog(newMember.guild, embed, {
        category: "moderation",
        eventType: "memberUpdate",
        user,
        record: {
          title: "Zaman Aşımı Kaldırıldı",
          description: `${newMember.user.tag} kullanıcısının zaman aşımı kaldırıldı`,
          color: "#22c55e",
        },
      });
      return true;
    }

    return false;
  }
}

const defaultMemberUpdateStrategies: IMemberUpdateStrategy[] = [
  new NicknameUpdateStrategy(),
  new RoleUpdateStrategy(),
  new TimeoutUpdateStrategy(),
];

export async function handleGuildMemberUpdate(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember,
  strategies: IMemberUpdateStrategy[] = defaultMemberUpdateStrategies,
  logger: IAuditLogger = auditLoggerService
): Promise<void> {
  // Önbellekte olmayan (Partial) üyelerin eski rolleri ve verileri bilinemez.
  if (oldMember.partial) {
    return;
  }

  const user: LogUserSummary = {
    id: newMember.id,
    tag: newMember.user.tag,
    avatarUrl: newMember.user.displayAvatarURL(),
    isBot: newMember.user.bot,
  };

  for (const strategy of strategies) {
    const handled = await strategy.tryHandle(oldMember, newMember, user, logger);
    if (handled) return;
  }
}
