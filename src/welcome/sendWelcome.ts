import { AttachmentBuilder, GuildMember, type GuildTextBasedChannel } from "discord.js";
import { getGuildSettings } from "../settings.js";
import { applyPlaceholders, renderWelcomeCard, type CardData } from "./cardRenderer.js";
import { addActivity } from "../utils/activityTracker.js";

export function cardDataFromMember(member: GuildMember): CardData {
  return {
    username: member.user.username,
    displayName: member.displayName,
    avatarUrl: member.user.displayAvatarURL({ extension: "png", size: 512 }),
    serverName: member.guild.name,
    memberCount: member.guild.memberCount,
  };
}

/**
 * Üyeye karşılama kartını gönderir.
 * @param channelOverride Test gönderimlerinde farklı bir kanal kullanmak için
 */
export async function sendWelcome(member: GuildMember, channelOverride?: GuildTextBasedChannel): Promise<void> {
  const { welcome } = getGuildSettings(member.guild.id);

  const channel =
    channelOverride ??
    (await member.guild.channels.fetch(welcome.channelId).catch(() => null));

  if (!channel || !channel.isTextBased()) {
    throw new Error("Karşılama kanalı bulunamadı veya metin kanalı değil.");
  }

  const data = cardDataFromMember(member);
  const image = await renderWelcomeCard(welcome.card, data);
  const content = applyPlaceholders(welcome.message, data).replaceAll("{mention}", `<@${member.id}>`);

  await channel.send({
    content: content || undefined,
    files: [new AttachmentBuilder(image, { name: "hosgeldin.png" })],
    allowedMentions: { users: [member.id] },
  });
}

export async function handleWelcome(member: GuildMember): Promise<void> {
  const { welcome } = getGuildSettings(member.guild.id);
  if (!welcome.enabled || !welcome.channelId || member.user.bot) return;

  try {
    await sendWelcome(member);
    addActivity({
      guildId: member.guild.id,
      type: "welcome",
      title: "Karşılama Kartı Gönderildi",
      desc: `${member.user.tag} için kart oluşturuldu`,
      icon: "id-card",
      color: "#FFE000",
    });
  } catch (error) {
    console.error("[Karşılama] Kart gönderilemedi:", error);
  }
}
