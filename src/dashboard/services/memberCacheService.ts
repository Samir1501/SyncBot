import type { Guild } from "discord.js";

export interface IMemberCacheService {
  ensureMembersCached(guild: Guild, force?: boolean): Promise<void>;
}

/**
 * Single Responsibility (SRP): Discord sunucu üyelerinin önbelleğe alınmasını
 * hız limiti (cooldown) ve eşzamanlı istek birleştirme (in-flight deduplication) ile yönetir.
 */
export class MemberCacheService implements IMemberCacheService {
  private readonly lastMemberFetchAt = new Map<string, number>();
  private readonly pendingMemberFetches = new Map<string, Promise<void>>();

  constructor(
    private readonly normalCooldownMs: number = 60 * 1000,
    private readonly forceCooldownMs: number = 10 * 1000
  ) {}

  public async ensureMembersCached(guild: Guild, force = false): Promise<void> {
    if (!force && guild.members.cache.size >= guild.memberCount) return;

    const pending = this.pendingMemberFetches.get(guild.id);
    if (pending) return pending;

    const cooldown = force ? this.forceCooldownMs : this.normalCooldownMs;
    if (Date.now() - (this.lastMemberFetchAt.get(guild.id) ?? 0) < cooldown) return;

    this.lastMemberFetchAt.set(guild.id, Date.now());
    const task = guild.members
      .fetch()
      .then(() => undefined)
      .catch((err) => {
        console.warn("[Panel] guild.members.fetch uyarısı:", err);
      })
      .finally(() => {
        this.pendingMemberFetches.delete(guild.id);
      });

    this.pendingMemberFetches.set(guild.id, task);
    return task;
  }
}

export const memberCacheService = new MemberCacheService();
