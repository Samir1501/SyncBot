import type { Message } from "discord.js";
import { feedDeduplicator } from "../services/feed/FeedDeduplicator.js";
import { feedService } from "../services/feed/FeedService.js";
import { activityTrackerService } from "../services/activity/ActivityTrackerService.js";

export const recentlyPostedFeedIds = feedDeduplicator.getRawMap();

export function markAndCheckPosted(id: string): boolean {
  return feedDeduplicator.markAndCheck(id);
}

/**
 * Belirtilen kaynak kanallardaki yeni gönderileri ve forum starter mesajlarını özetleyerek
 * sunucunun Ana Sayfa (Feed) kanalında paylaşır.
 */
export async function handleMessageCreate(message: Message): Promise<void> {
  if (message.guildId) {
    activityTrackerService.recordMessage(message.guildId, message.channelId, message.author?.bot);
  }
  return feedService.handleMessage(message);
}
