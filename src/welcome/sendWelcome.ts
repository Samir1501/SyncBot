import { AttachmentBuilder, GuildMember, type GuildTextBasedChannel } from "discord.js";
import { activityRepository, type IActivityRepository } from "../repositories/activityRepository.js";
import { settingsRepository } from "../settings/repository.js";
import type { ISettingsRepository } from "../settings/types.js";
import { applyPlaceholders, renderWelcomeCard, type CardData } from "./cardRenderer.js";

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
 * Single Responsibility (SRP) & Dependency Inversion (DIP) uyumlu karşılama servisi.
 */
export class WelcomeService {
  constructor(
    private readonly settingsRepo: ISettingsRepository = settingsRepository,
    private readonly activityRepo: IActivityRepository = activityRepository
  ) {}

  public async sendWelcome(
    member: GuildMember,
    channelOverride?: GuildTextBasedChannel
  ): Promise<void> {
    const { welcome } = this.settingsRepo.getGuildSettings(member.guild.id);

    const channel =
      channelOverride ??
      (await member.guild.channels.fetch(welcome.channelId).catch(() => null));

    if (!channel || !channel.isTextBased()) {
      throw new Error("Karşılama kanalı bulunamadı veya metin kanalı değil.");
    }

    const data = cardDataFromMember(member);
    const image = await renderWelcomeCard(welcome.card, data);
    const content = applyPlaceholders(welcome.message, data).replaceAll(
      "{mention}",
      `<@${member.id}>`
    );

    await channel.send({
      content: content || undefined,
      files: [new AttachmentBuilder(image, { name: "hosgeldin.png" })],
      allowedMentions: { users: [member.id] },
    });
  }

  public async handleMemberJoin(member: GuildMember): Promise<void> {
    const { welcome } = this.settingsRepo.getGuildSettings(member.guild.id);
    if (!welcome.enabled || !welcome.channelId || member.user.bot) return;

    try {
      await this.sendWelcome(member);
      this.activityRepo.add({
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
}

export const welcomeService = new WelcomeService();

export async function sendWelcome(
  member: GuildMember,
  channelOverride?: GuildTextBasedChannel
): Promise<void> {
  return welcomeService.sendWelcome(member, channelOverride);
}

export async function handleWelcome(member: GuildMember): Promise<void> {
  return welcomeService.handleMemberJoin(member);
}
