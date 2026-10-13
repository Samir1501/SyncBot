import { Colors, EmbedBuilder, VoiceState } from "discord.js";
import { sendLog } from "../utils/logger.js";

export async function handleVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState
): Promise<void> {
  const member = newState.member || oldState.member;
  if (!member) return;

  const user = {
    id: member.id,
    tag: member.user.tag,
    avatarUrl: member.user.displayAvatarURL(),
    isBot: member.user.bot,
  };

  const embed = new EmbedBuilder()
    .setAuthor({
      name: `${member.user.tag} (${member.user.id})`,
      iconURL: member.user.displayAvatarURL(),
    })
    .setTimestamp();

  // 1. Odaya Katılma
  if (!oldState.channelId && newState.channelId) {
    const channelName = newState.channel?.name || "Ses Kanalı";
    embed
      .setColor(Colors.Green)
      .setTitle("🔊 Ses Kanalına Katıldı")
      .addFields(
        { name: "Kullanıcı", value: `<@${member.id}>`, inline: true },
        { name: "Kanal", value: `<#${newState.channelId}>`, inline: true }
      );
    await sendLog(
      newState.guild,
      embed,
      {
        category: "voice",
        eventType: "voiceJoinLeave",
        channelId: newState.channelId,
        channelName,
        user,
        record: {
          title: "Ses Kanalına Katıldı",
          description: `${member.user.tag} kullanıcısı #${channelName} ses kanalına girdi`,
          details: { channelId: newState.channelId, channelName },
          color: "#22c55e",
        },
      }
    );
    return;
  }

  // 2. Odadan Ayrılma
  if (oldState.channelId && !newState.channelId) {
    const channelName = oldState.channel?.name || "Ses Kanalı";
    embed
      .setColor(Colors.Red)
      .setTitle("🔇 Ses Kanalından Ayrıldı")
      .addFields(
        { name: "Kullanıcı", value: `<@${member.id}>`, inline: true },
        { name: "Kanal", value: `<#${oldState.channelId}>`, inline: true }
      );
    await sendLog(
      newState.guild,
      embed,
      {
        category: "voice",
        eventType: "voiceJoinLeave",
        channelId: oldState.channelId,
        channelName,
        user,
        record: {
          title: "Ses Kanalından Ayrıldı",
          description: `${member.user.tag} kullanıcısı #${channelName} ses kanalından çıktı`,
          details: { channelId: oldState.channelId, channelName },
          color: "#ef4444",
        },
      }
    );
    return;
  }

  // 3. Oda Değiştirme
  if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
    const oldChannelName = oldState.channel?.name || "Eski Kanal";
    const newChannelName = newState.channel?.name || "Yeni Kanal";
    embed
      .setColor(Colors.Blue)
      .setTitle("🔄 Ses Kanalı Değiştirdi")
      .addFields(
        { name: "Kullanıcı", value: `<@${member.id}>`, inline: true },
        { name: "Eski Kanal", value: `<#${oldState.channelId}>`, inline: true },
        { name: "Yeni Kanal", value: `<#${newState.channelId}>`, inline: true }
      );
    await sendLog(
      newState.guild,
      embed,
      {
        category: "voice",
        eventType: "voiceJoinLeave",
        channelId: newState.channelId,
        channelName: newChannelName,
        user,
        record: {
          title: "Ses Kanalı Değiştirdi",
          description: `${member.user.tag} odadan ayrılıp başka odaya geçti (#${oldChannelName} ➔ #${newChannelName})`,
          details: { oldChannelName, newChannelName },
          color: "#3b82f6",
        },
      }
    );
    return;
  }

  // 4. Sunucu Tarafından Susturma / Sağırlaştırma (Server Mute / Server Deafen)
  if (oldState.serverMute !== newState.serverMute) {
    const isMuted = newState.serverMute;
    embed
      .setColor(isMuted ? Colors.Orange : Colors.Grey)
      .setTitle(isMuted ? "🎙️ Yetkili Tarafından Susturuldu" : "🎙️ Yetkili Susturması Kaldırıldı")
      .addFields(
        { name: "Kullanıcı", value: `<@${member.id}>`, inline: true },
        { name: "Kanal", value: `<#${newState.channelId}>`, inline: true }
      );
    await sendLog(
      newState.guild,
      embed,
      {
        category: "voice",
        eventType: "voiceMuteDeafen",
        channelId: newState.channelId || undefined,
        channelName: newState.channel?.name || undefined,
        user,
        record: {
          title: isMuted ? "Ses Odasında Susturuldu" : "Susturma Kaldırıldı",
          description: `${member.user.tag} kullanıcısının ses susturması ${isMuted ? "uygulandı" : "kaldırıldı"}`,
          details: { serverMute: Boolean(isMuted) },
          color: isMuted ? "#f97316" : "#64748b",
        },
      }
    );
    return;
  }
}
