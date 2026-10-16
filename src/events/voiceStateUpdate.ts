import { Colors, EmbedBuilder, GuildMember, VoiceState } from "discord.js";
import type { LogUserSummary } from "../repositories/logRepository.js";
import { auditLoggerService, type IAuditLogger } from "../services/logging/AuditLoggerService.js";

export interface IVoiceStateStrategy {
  tryHandle(
    member: GuildMember,
    oldState: VoiceState,
    newState: VoiceState,
    user: LogUserSummary,
    logger: IAuditLogger
  ): Promise<boolean>;
}

function createBaseVoiceEmbed(member: GuildMember): EmbedBuilder {
  return new EmbedBuilder()
    .setAuthor({
      name: `${member.user.tag} (${member.user.id})`,
      iconURL: member.user.displayAvatarURL(),
    })
    .setTimestamp();
}

export class VoiceJoinStrategy implements IVoiceStateStrategy {
  public async tryHandle(
    member: GuildMember,
    oldState: VoiceState,
    newState: VoiceState,
    user: LogUserSummary,
    logger: IAuditLogger
  ): Promise<boolean> {
    if (oldState.channelId || !newState.channelId) return false;

    const channelName = newState.channel?.name || "Ses Kanalı";
    const embed = createBaseVoiceEmbed(member)
      .setColor(Colors.Green)
      .setTitle("🔊 Ses Kanalına Katıldı")
      .addFields(
        { name: "Kullanıcı", value: `<@${member.id}>`, inline: true },
        { name: "Kanal", value: `<#${newState.channelId}>`, inline: true }
      );

    await logger.sendLog(newState.guild, embed, {
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
    });
    return true;
  }
}

export class VoiceLeaveStrategy implements IVoiceStateStrategy {
  public async tryHandle(
    member: GuildMember,
    oldState: VoiceState,
    newState: VoiceState,
    user: LogUserSummary,
    logger: IAuditLogger
  ): Promise<boolean> {
    if (!oldState.channelId || newState.channelId) return false;

    const channelName = oldState.channel?.name || "Ses Kanalı";
    const embed = createBaseVoiceEmbed(member)
      .setColor(Colors.Red)
      .setTitle("🔇 Ses Kanalından Ayrıldı")
      .addFields(
        { name: "Kullanıcı", value: `<@${member.id}>`, inline: true },
        { name: "Kanal", value: `<#${oldState.channelId}>`, inline: true }
      );

    await logger.sendLog(newState.guild, embed, {
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
    });
    return true;
  }
}

export class VoiceSwitchStrategy implements IVoiceStateStrategy {
  public async tryHandle(
    member: GuildMember,
    oldState: VoiceState,
    newState: VoiceState,
    user: LogUserSummary,
    logger: IAuditLogger
  ): Promise<boolean> {
    if (!oldState.channelId || !newState.channelId || oldState.channelId === newState.channelId) {
      return false;
    }

    const oldChannelName = oldState.channel?.name || "Eski Kanal";
    const newChannelName = newState.channel?.name || "Yeni Kanal";
    const embed = createBaseVoiceEmbed(member)
      .setColor(Colors.Blue)
      .setTitle("🔄 Ses Kanalı Değiştirdi")
      .addFields(
        { name: "Kullanıcı", value: `<@${member.id}>`, inline: true },
        { name: "Eski Kanal", value: `<#${oldState.channelId}>`, inline: true },
        { name: "Yeni Kanal", value: `<#${newState.channelId}>`, inline: true }
      );

    await logger.sendLog(newState.guild, embed, {
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
    });
    return true;
  }
}

export class VoiceServerMuteStrategy implements IVoiceStateStrategy {
  public async tryHandle(
    member: GuildMember,
    oldState: VoiceState,
    newState: VoiceState,
    user: LogUserSummary,
    logger: IAuditLogger
  ): Promise<boolean> {
    if (oldState.serverMute === newState.serverMute) return false;

    const isMuted = newState.serverMute;
    const embed = createBaseVoiceEmbed(member)
      .setColor(isMuted ? Colors.Orange : Colors.Grey)
      .setTitle(isMuted ? "🎙️ Yetkili Tarafından Susturuldu" : "🎙️ Yetkili Susturması Kaldırıldı")
      .addFields(
        { name: "Kullanıcı", value: `<@${member.id}>`, inline: true },
        { name: "Kanal", value: `<#${newState.channelId}>`, inline: true }
      );

    await logger.sendLog(newState.guild, embed, {
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
    });
    return true;
  }
}

const defaultVoiceStrategies: IVoiceStateStrategy[] = [
  new VoiceJoinStrategy(),
  new VoiceLeaveStrategy(),
  new VoiceSwitchStrategy(),
  new VoiceServerMuteStrategy(),
];

export async function handleVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState,
  strategies: IVoiceStateStrategy[] = defaultVoiceStrategies,
  logger: IAuditLogger = auditLoggerService
): Promise<void> {
  const member = newState.member || oldState.member;
  if (!member) return;

  const user: LogUserSummary = {
    id: member.id,
    tag: member.user.tag,
    avatarUrl: member.user.displayAvatarURL(),
    isBot: member.user.bot,
  };

  for (const strategy of strategies) {
    const handled = await strategy.tryHandle(member, oldState, newState, user, logger);
    if (handled) return;
  }
}
