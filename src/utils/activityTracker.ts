export * from "../repositories/activityRepository.js";
import { activityRepository, type ActivityEvent } from "../repositories/activityRepository.js";

/** Bekleyen aktiviteleri hemen diske yazar (bot kapanırken çağrılır) */
export function flushActivities(): void {
  activityRepository.flush();
}

export function addActivity(event: Omit<ActivityEvent, "id" | "time">): void {
  activityRepository.add(event);
}

export function getActivities(guildId?: string): ActivityEvent[] {
  return activityRepository.getRecent(guildId, 10);
}
