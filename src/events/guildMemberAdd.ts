import { Colors, EmbedBuilder, GuildMember } from "discord.js";
import { activityRepository, type IActivityRepository } from "../repositories/activityRepository.js";
import { auditLoggerService, type IAuditLogger } from "../services/logging/AuditLoggerService.js";

export async function handleGuildMemberAdd(
  member: GuildMember,
  logger: IAuditLogger = auditLoggerService,
  activityRepo: IActivityRepository = activityRepository
): Promise<void> {
  activityRepo.add({
    guildId: member.guild.id,
    type: "member_join",
    title: "Yeni Üye Katıldı",
    desc: `${member.user.tag} sunucuya giriş yaptı`,
    icon: "user-plus",
    color: "#22c55e",
  });

  const accountAgeDays = Math.floor(
    (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24)
  );

  const embed = new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle("📥 Sunucuya Yeni Üye Katıldı")
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: "Kullanıcı", value: `<@${member.id}> (${member.user.tag})`, inline: true },
      { name: "Kullanıcı ID", value: `\`${member.id}\``, inline: true },
      {
        name: "Hesap Oluşturulma",
        value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R> (${accountAgeDays} gün önce)`,
        inline: false,
      },
      { name: "Toplam Üye Sayısı", value: `${member.guild.memberCount}`, inline: true }
    )
    .setTimestamp();

  await logger.sendLog(member.guild, embed, {
    category: "members",
    eventType: "memberJoin",
    user: {
      id: member.id,
      tag: member.user.tag,
      avatarUrl: member.user.displayAvatarURL(),
      isBot: member.user.bot,
    },
    record: {
      title: "Yeni Üye Katıldı",
      description: `${member.user.tag} sunucuya katıldı. Toplam üye: ${member.guild.memberCount}`,
      details: {
        tag: member.user.tag,
        id: member.id,
        memberCount: member.guild.memberCount,
      },
      color: "#22c55e",
    },
  });
}
