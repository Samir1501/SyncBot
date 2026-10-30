import { Guild } from "discord.js";
import { activityRepository, type IActivityRepository } from "../repositories/activityRepository.js";

/**
 * Bot bir sunucudan çıkarıldığında veya sunucu silindiğinde tetiklenir (GuildDelete).
 */
export async function handleGuildDelete(
  guild: Guild,
  activityRepo: IActivityRepository = activityRepository
): Promise<void> {
  console.log(`[Sunucu Ayrıldı] ℹ️ Bot sunucudan ayrıldı: ${guild.name} (${guild.id})`);

  activityRepo.add({
    guildId: guild.id,
    type: "bot",
    title: "Sunucudan Ayrıldı",
    desc: `Bot, ${guild.name} sunucusundan çıkarıldı veya sunucu silindi`,
    icon: "arrow-right-from-bracket",
    color: "#ef4444",
  });
}
