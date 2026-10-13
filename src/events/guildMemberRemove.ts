import { Colors, EmbedBuilder, GuildMember, PartialGuildMember } from "discord.js";
import { sendLog } from "../utils/logger.js";
import { addActivity } from "../utils/activityTracker.js";

export async function handleGuildMemberRemove(
  member: GuildMember | PartialGuildMember
): Promise<void> {
  const userTag = member.user?.tag || member.id;
  const isBot = member.user?.bot || false;

  if (member.guild) {
    addActivity({
      guildId: member.guild.id,
      type: "member_leave",
      title: "Üye Ayrıldı",
      desc: `${userTag} sunucudan ayrıldı`,
      icon: "user-minus",
      color: "#ef4444",
    });
  }

  const embed = new EmbedBuilder()
    .setColor(Colors.Red)
    .setTitle("📤 Üye Sunucudan Ayrıldı")
    .setThumbnail(member.user?.displayAvatarURL() || null)
    .addFields(
      { name: "Kullanıcı", value: `<@${member.id}> (${userTag})`, inline: true },
      { name: "Kullanıcı ID", value: `\`${member.id}\``, inline: true },
      { name: "Kalan Üye Sayısı", value: `${member.guild.memberCount}`, inline: true }
    )
    .setTimestamp();

  if (member.guild) {
    await sendLog(
      member.guild,
      embed,
      {
        category: "members",
        eventType: "memberLeave",
        user: member.user
          ? {
              id: member.id,
              tag: member.user.tag,
              avatarUrl: member.user.displayAvatarURL(),
              isBot,
            }
          : {
              id: member.id,
              tag: userTag,
              isBot,
            },
        record: {
          title: "Üye Ayrıldı",
          description: `${userTag} sunucudan ayrıldı. Kalan üye: ${member.guild.memberCount}`,
          details: {
            tag: userTag,
            id: member.id,
            remainingMembers: member.guild.memberCount,
          },
          color: "#ef4444",
        },
      }
    );
  }
}
