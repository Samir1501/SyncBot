import type { Guild, GuildMember } from "discord.js";
import { activityRepository, type IActivityRepository } from "../../repositories/activityRepository.js";

export interface ModerationActionPayload {
  action: string;
  durationMinutes?: number;
  nickname?: string | null;
  reason?: string;
}

export interface ModerationActionResult {
  status: number;
  body: { ok?: boolean; message?: string; error?: string };
}

/**
 * Open/Closed Principle (OCP): Yeni bir üye moderasyon işlemi eklemek için mevcut
 * kodu değiştirmek yerine yeni bir `IMemberModerationStrategy` sınıfı tanımlanır.
 */
export interface IMemberModerationStrategy {
  readonly actionName: string;
  execute(
    guild: Guild,
    member: GuildMember,
    payload: ModerationActionPayload,
    activityRepo: IActivityRepository
  ): Promise<ModerationActionResult>;
}

export class TimeoutModerationStrategy implements IMemberModerationStrategy {
  public readonly actionName = "timeout";

  public async execute(
    guild: Guild,
    member: GuildMember,
    payload: ModerationActionPayload,
    activityRepo: IActivityRepository
  ): Promise<ModerationActionResult> {
    const minutes = Number(payload.durationMinutes) || 0;
    if (minutes <= 0) {
      await member.timeout(null, payload.reason || "Yönetim paneli tarafından zamanaşımı kaldırıldı");
      activityRepo.add({
        guildId: guild.id,
        type: "bot",
        title: "Zamanaşımı Kaldırıldı",
        desc: `${member.user.tag} üyesinin zamanaşımı kaldırıldı`,
        icon: "hourglass",
        color: "#22c55e",
      });
      return {
        status: 200,
        body: { ok: true, message: `${member.user.tag} için zamanaşımı kaldırıldı.` },
      };
    }

    const ms = minutes * 60 * 1000;
    await member.timeout(
      ms,
      payload.reason || `Yönetim panelinden ${minutes} dakika ceza uygulandı`
    );
    activityRepo.add({
      guildId: guild.id,
      type: "bot",
      title: "Zamanaşımı Uygulandı",
      desc: `${member.user.tag} üyesine ${minutes} dk zamanaşımı verildi`,
      icon: "hourglass-half",
      color: "#f87171",
    });
    return {
      status: 200,
      body: { ok: true, message: `${member.user.tag} üyesine ${minutes} dakika zamanaşımı uygulandı.` },
    };
  }
}

export class KickModerationStrategy implements IMemberModerationStrategy {
  public readonly actionName = "kick";

  public async execute(
    guild: Guild,
    member: GuildMember,
    payload: ModerationActionPayload,
    activityRepo: IActivityRepository
  ): Promise<ModerationActionResult> {
    if (!member.kickable) {
      return {
        status: 403,
        body: {
          error:
            "Bu üyeyi atma yetkiniz yok (Rolü botunkinden yüksek veya sunucu sahibi).",
        },
      };
    }

    await member.kick(payload.reason || "Yönetim panelinden atıldı");
    activityRepo.add({
      guildId: guild.id,
      type: "member_leave",
      title: "Üye Sunucudan Atıldı",
      desc: `${member.user.tag} yönetim panelinden atıldı`,
      icon: "user-xmark",
      color: "#ef4444",
    });
    return {
      status: 200,
      body: { ok: true, message: `${member.user.tag} sunucudan atıldı.` },
    };
  }
}

export class SetNicknameModerationStrategy implements IMemberModerationStrategy {
  public readonly actionName = "setNickname";

  public async execute(
    _guild: Guild,
    member: GuildMember,
    payload: ModerationActionPayload
  ): Promise<ModerationActionResult> {
    if (!member.manageable) {
      return {
        status: 403,
        body: { error: "Bu üyenin takma adını değiştirme yetkisi yok." },
      };
    }

    const newNick = payload.nickname ? String(payload.nickname).trim().slice(0, 32) : null;
    await member.setNickname(newNick, payload.reason || "Yönetim paneli");
    return {
      status: 200,
      body: {
        ok: true,
        message: `Takma ad ${newNick ? `"${newNick}" olarak ayarlandı.` : "sıfırlandı."}`,
      },
    };
  }
}

export class MemberModerationService {
  private readonly strategies = new Map<string, IMemberModerationStrategy>();

  constructor(
    initialStrategies: IMemberModerationStrategy[] = [
      new TimeoutModerationStrategy(),
      new KickModerationStrategy(),
      new SetNicknameModerationStrategy(),
    ],
    private readonly activityRepo: IActivityRepository = activityRepository
  ) {
    for (const strategy of initialStrategies) {
      this.registerStrategy(strategy);
    }
  }

  public registerStrategy(strategy: IMemberModerationStrategy): void {
    this.strategies.set(strategy.actionName, strategy);
  }

  public async executeAction(
    guild: Guild,
    member: GuildMember,
    payload: ModerationActionPayload
  ): Promise<ModerationActionResult> {
    const strategy = this.strategies.get(payload.action);
    if (!strategy) {
      return {
        status: 400,
        body: { error: "Geçersiz işlem." },
      };
    }
    return strategy.execute(guild, member, payload, this.activityRepo);
  }
}

export const memberModerationService = new MemberModerationService();
