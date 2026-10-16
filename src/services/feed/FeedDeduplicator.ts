/**
 * Gönderi akışına iletilmiş olan mesaj ve thread kimliklerini (ID) takip eden önbellek.
 * Aynı gönderinin birden fazla kez akışa gönderilmesini önler (Single Responsibility).
 */
export class FeedDeduplicator {
  private readonly cache = new Map<string, number>();
  private readonly ttlMs: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(ttlMs: number = 10 * 60 * 1000, cleanupIntervalMs: number = 60 * 1000) {
    this.ttlMs = ttlMs;
    this.cleanupTimer = setInterval(() => this.pruneExpired(), cleanupIntervalMs);
    this.cleanupTimer.unref();
  }

  public pruneExpired(): void {
    const now = Date.now();
    for (const [id, expiresAt] of this.cache) {
      if (expiresAt <= now) {
        this.cache.delete(id);
      }
    }
  }

  /**
   * Kimlik daha önce işlendiyse ve süresi dolmadıysa `true` döner;
   * aksi halde kimliği kaydedip `false` döner.
   */
  public markAndCheck(id: string): boolean {
    const now = Date.now();
    const expiresAt = this.cache.get(id);
    if (expiresAt !== undefined && expiresAt > now) {
      return true;
    }
    this.cache.set(id, now + this.ttlMs);
    return false;
  }

  public getRawMap(): Map<string, number> {
    return this.cache;
  }
}

export const feedDeduplicator = new FeedDeduplicator();
