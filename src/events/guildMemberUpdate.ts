import {
  AuditLogEvent,
  Colors,
  EmbedBuilder,
  GuildMember,
  PartialGuildMember,
} from "discord.js";
import { sendLog } from "../utils/logger.js";

export async function handleGuildMemberUpdate(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember
): Promise<void> {
  // 1. Önbellekte olmayan (Partial) üyelerin eski rolleri ve verileri bilinemez.
  // Bu durum Discord gateway senkronizasyonunda eski rollerin "yeni verilmiş" gibi
  // sahte (hayalet) loglanmasına yol açar. Bu yüzden partial üyeleri yoksayıyoruz.
  if (oldMember.partial) {
    return;
  }

  const user = {
    id: newMember.id,
    tag: newMember.user.tag,
    avatarUrl: newMember.user.displayAvatarURL(),
    isBot: newMember.user.bot,
  };

  const embed = new EmbedBuilder()
    .setAuthor({
      name: `${newMember.user.tag} (${newMember.user.id})`,
      iconURL: newMember.user.displayAvatarURL(),
    })
    .setTimestamp();

  // 2. Takma Ad Değişikliği (Nickname)
  if (oldMember.nickname !== newMember.nickname) {
    const oldNick = oldMember.nickname || "*Yok (Orijinal Ad)*";
    const newNick = newMember.nickname || "*Sıfırlandı*";
    embed
      .setColor(Colors.Blue)
      .setTitle("🏷️ Takma Ad Değiştirildi")
      .addFields(
        { name: "Kullanıcı", value: `<@${newMember.id}>`, inline: true },
        { name: "Eski Takma Ad", value: oldNick, inline: true },
        { name: "Yeni Takma Ad", value: newNick, inline: true }
      );
    await sendLog(
      newMember.guild,
      embed,
      {
        category: "members",
        eventType: "memberUpdate",
        user,
        record: {
          title: "Takma Ad Değiştirildi",
          description: `${newMember.user.tag} takma adını değiştirdi: ${oldNick} ➔ ${newNick}`,
          details: { oldNick, newNick },
          color: "#3b82f6",
        },
      }
    );
    return;
  }

  // 3. Rol Güncellemeleri
  // Eski rol önbelleği boş veya sadece @everyone ise ancak yeni üyede birden fazla rol varsa,
  // bu bir Discord önbellek eksikliği (cache miss) olabilir.
  const isOldRoleCacheSuspicious = oldMember.roles.cache.size <= 1 && newMember.roles.cache.size > 2;

  const addedRoles = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
  const removedRoles = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));

  if (addedRoles.size > 0 || removedRoles.size > 0) {
    // Audit Log (Denetim Kaydı) doğrulaması: Bu rol değişikliği gerçekten YENİ mi yapıldı?
    let executorTag = "";
    let isVerifiedRecentChange = false;

    try {
      const auditLogs = await newMember.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberRoleUpdate,
        limit: 1,
      });
      const entry = auditLogs.entries.first();

      // Denetim kaydı bu kullanıcıya ait ve son 20 saniye içinde mi yapılmış?
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
      // Audit log çekme yetkisi yoksa veya hata verirse normal akışa devam et
      isVerifiedRecentChange = !isOldRoleCacheSuspicious;
    }

    // Eğer eski rol önbelleği şüpheliyse ve denetim kaydında son 20 saniyede bir rol işlemi yoksa,
    // bu olay Discord'un eski rolleri yeniden yüklemesidir. Yanlış log basmayı önle!
    if (isOldRoleCacheSuspicious && !isVerifiedRecentChange) {
      console.log(`[Log Guard] ${newMember.user.tag} için önbellek kaynaklı eski rol atama olayı engellendi.`);
      return;
    }

    if (addedRoles.size > 0) {
      const roleNames = addedRoles.map((r) => r.name).join(", ");
      embed
        .setColor(Colors.Green)
        .setTitle("🛡️ Üyeye Rol Verildi")
        .addFields(
          { name: "Kullanıcı", value: `<@${newMember.id}>`, inline: true },
          { name: "Eklenen Rol(ler)", value: addedRoles.map((r) => `<@&${r.id}>`).join(", "), inline: false }
        );
      await sendLog(
        newMember.guild,
        embed,
        {
          category: "members",
          eventType: "memberUpdate",
          user,
          record: {
            title: "Üyeye Rol Verildi",
            description: `${newMember.user.tag} kullanıcısına rol verildi: ${roleNames}${executorTag ? ` (Yetkili: ${executorTag})` : ""}`,
            details: { roles: roleNames, executor: executorTag || "Bilinmiyor" },
            color: "#22c55e",
          },
        }
      );
      return;
    }

    if (removedRoles.size > 0) {
      const roleNames = removedRoles.map((r) => r.name).join(", ");
      embed
        .setColor(Colors.Orange)
        .setTitle("🛡️ Üyeden Rol Alındı")
        .addFields(
          { name: "Kullanıcı", value: `<@${newMember.id}>`, inline: true },
          { name: "Alınan Rol(ler)", value: removedRoles.map((r) => `<@&${r.id}>`).join(", "), inline: false }
        );
      await sendLog(
        newMember.guild,
        embed,
        {
          category: "members",
          eventType: "memberUpdate",
          user,
          record: {
            title: "Üyeden Rol Alındı",
            description: `${newMember.user.tag} kullanıcısından rol alındı: ${roleNames}${executorTag ? ` (Yetkili: ${executorTag})` : ""}`,
            details: { roles: roleNames, executor: executorTag || "Bilinmiyor" },
            color: "#f97316",
          },
        }
      );
      return;
    }
  }

  // 4. Zaman Aşımı (Timeout / Susturma)
  if (
    oldMember.communicationDisabledUntilTimestamp !==
    newMember.communicationDisabledUntilTimestamp
  ) {
    if (newMember.communicationDisabledUntilTimestamp && newMember.isCommunicationDisabled()) {
      const timeoutDateUnix = Math.floor(newMember.communicationDisabledUntilTimestamp / 1000);
      embed
        .setColor(Colors.Red)
        .setTitle("⏳ Üyeye Zaman Aşımı (Timeout) Uygulandı")
        .addFields(
          { name: "Kullanıcı", value: `<@${newMember.id}>`, inline: true },
          { name: "Bitiş Tarihi", value: `<t:${timeoutDateUnix}:F> (<t:${timeoutDateUnix}:R>)`, inline: false }
        );
      await sendLog(
        newMember.guild,
        embed,
        {
          category: "moderation",
          eventType: "memberUpdate",
          user,
          record: {
            title: "Zaman Aşımı Uygulandı",
            description: `${newMember.user.tag} kullanıcısına zaman aşımı (timeout) uygulandı`,
            details: { expiresAt: new Date(newMember.communicationDisabledUntilTimestamp).toISOString() },
            color: "#ef4444",
          },
        }
      );
      return;
    } else if (
      oldMember.communicationDisabledUntilTimestamp &&
      !newMember.isCommunicationDisabled()
    ) {
      embed
        .setColor(Colors.Green)
        .setTitle("🔓 Zaman Aşımı (Timeout) Kaldırıldı")
        .addFields({ name: "Kullanıcı", value: `<@${newMember.id}>`, inline: true });
      await sendLog(
        newMember.guild,
        embed,
        {
          category: "moderation",
          eventType: "memberUpdate",
          user,
          record: {
            title: "Zaman Aşımı Kaldırıldı",
            description: `${newMember.user.tag} kullanıcısının zaman aşımı kaldırıldı`,
            color: "#22c55e",
          },
        }
      );
      return;
    }
  }
}
