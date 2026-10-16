import type { ThreadChannel } from "discord.js";
import { feedService } from "../services/feed/FeedService.js";

/**
 * Forum kanallarında veya metin kanallarında yeni bir alt başlık / gönderi (Thread / Forum Post)
 * oluşturulduğunda tetiklenir ve Ana Sayfa Akışı kanalına önizleme kartı gönderir.
 */
export async function handleThreadCreate(thread: ThreadChannel): Promise<void> {
  return feedService.handleThread(thread);
}
