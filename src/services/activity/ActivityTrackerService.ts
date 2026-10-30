import fs from "node:fs";
import path from "node:path";
import { type Client } from "discord.js";
import { DATA_DIR } from "../../settings/defaults.js";
import { createDebouncedJsonWriter, type DebouncedJsonWriter } from "../../utils/jsonFile.js";
import { logRepository } from "../../repositories/logRepository.js";

export interface ActivityBucket {
  messages: number;
  voice: number;
  joins: number;
  leaves: number;
}

export interface GuildActivityStorage {
  // Key: "YYYY-MM-DD-HH" (Örn: "2026-10-29-23")
  hourly: Record<string, ActivityBucket>;
  // Key: "YYYY-MM-DD" (Örn: "2026-10-29")
  daily: Record<string, ActivityBucket>;
  // Kanal bazlı sayaçlar: channelId -> mesaj sayısı
  channelMessages: Record<string, number>;
  // Ses kanalı bazlı sayaçlar: channelId -> olay sayısı
  voiceChannelEvents: Record<string, number>;
}

export interface ActivityTimelinePoint {
  label: string;
  messages: number;
  voice: number;
  joins: number;
  leaves: number;
}

export interface HourlyDistributionItem {
  hour: string; // "00:00" - "23:00"
  count: number;
  percentage: number;
  isPeak: boolean;
}

export interface WeekdayDistributionItem {
  day: string; // "Pazartesi" - "Pazar"
  count: number;
  percentage: number;
  isPeak: boolean;
}

export interface ChannelActivityItem {
  id: string;
  name: string;
  count: number;
  percentage: number;
}

export interface ActivityAnalyticsResult {
  period: "24h" | "7d" | "30d";
  summary: {
    totalMessages: number;
    totalVoiceEvents: number;
    totalJoins: number;
    totalLeaves: number;
    netMemberChange: number;
    activeVoiceNow: number;
    avgPerHour: number;
    peakHour: string;
    busiestDay: string;
    mostActiveChannel: string;
  };
  timeline: {
    labels: string[];
    messages: number[];
    voice: number[];
    joins: number[];
    leaves: number[];
  };
  hourlyDistribution: {
    labels: string[];
    counts: number[];
    peakHour: string;
    peakCount: number;
  };
  weekdayDistribution: {
    labels: string[];
    counts: number[];
    peakDay: string;
  };
  topChannels: ChannelActivityItem[];
  voiceDistribution: ChannelActivityItem[];
  memberGrowth: {
    labels: string[];
    joins: number[];
    leaves: number[];
    net: number[];
  };
}

const DEFAULT_FILE = path.join(DATA_DIR, "activity_history.json");

export class ActivityTrackerService {
  private data: Record<string, GuildActivityStorage> = {};
  private readonly writer: DebouncedJsonWriter;
  private readonly filePath: string;

  constructor(filePath: string = DEFAULT_FILE) {
    this.filePath = filePath;
    this.loadFromDisk();
    this.writer = createDebouncedJsonWriter(this.filePath, () => this.data, 1500, "ActivityTracker");
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        this.data = JSON.parse(raw);
      }
    } catch (err) {
      console.warn("[ActivityTracker] Veriler okunamadı, boş başlatılıyor:", err);
      this.data = {};
    }
  }

  private getGuildStorage(guildId: string): GuildActivityStorage {
    if (!this.data[guildId]) {
      this.data[guildId] = {
        hourly: {},
        daily: {},
        channelMessages: {},
        voiceChannelEvents: {},
      };
    }
    return this.data[guildId];
  }

  private getKeys(date: Date = new Date()): { hourKey: string; dayKey: string } {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const h = String(date.getHours()).padStart(2, "0");
    return {
      hourKey: `${y}-${m}-${d}-${h}`,
      dayKey: `${y}-${m}-${d}`,
    };
  }

  /**
   * Yeni mesaj gönderildiğinde sayaçları artırır
   */
  public recordMessage(guildId: string, channelId: string, isBot: boolean = false): void {
    if (!guildId) return;
    const storage = this.getGuildStorage(guildId);
    const { hourKey, dayKey } = this.getKeys();

    if (!storage.hourly[hourKey]) storage.hourly[hourKey] = { messages: 0, voice: 0, joins: 0, leaves: 0 };
    if (!storage.daily[dayKey]) storage.daily[dayKey] = { messages: 0, voice: 0, joins: 0, leaves: 0 };

    storage.hourly[hourKey].messages += 1;
    storage.daily[dayKey].messages += 1;

    if (channelId && !isBot) {
      storage.channelMessages[channelId] = (storage.channelMessages[channelId] || 0) + 1;
    }

    this.writer.schedule();
  }

  /**
   * Ses odası katılım/ayrılma/hareket olaylarını kaydeder
   */
  public recordVoiceEvent(guildId: string, channelId?: string): void {
    if (!guildId) return;
    const storage = this.getGuildStorage(guildId);
    const { hourKey, dayKey } = this.getKeys();

    if (!storage.hourly[hourKey]) storage.hourly[hourKey] = { messages: 0, voice: 0, joins: 0, leaves: 0 };
    if (!storage.daily[dayKey]) storage.daily[dayKey] = { messages: 0, voice: 0, joins: 0, leaves: 0 };

    storage.hourly[hourKey].voice += 1;
    storage.daily[dayKey].voice += 1;

    if (channelId) {
      storage.voiceChannelEvents[channelId] = (storage.voiceChannelEvents[channelId] || 0) + 1;
    }

    this.writer.schedule();
  }

  /**
   * Üye giriş/çıkış olaylarını kaydeder
   */
  public recordMemberEvent(guildId: string, type: "join" | "leave"): void {
    if (!guildId) return;
    const storage = this.getGuildStorage(guildId);
    const { hourKey, dayKey } = this.getKeys();

    if (!storage.hourly[hourKey]) storage.hourly[hourKey] = { messages: 0, voice: 0, joins: 0, leaves: 0 };
    if (!storage.daily[dayKey]) storage.daily[dayKey] = { messages: 0, voice: 0, joins: 0, leaves: 0 };

    if (type === "join") {
      storage.hourly[hourKey].joins += 1;
      storage.daily[dayKey].joins += 1;
    } else {
      storage.hourly[hourKey].leaves += 1;
      storage.daily[dayKey].leaves += 1;
    }

    this.writer.schedule();
  }

  /**
   * Sunucu verilerini geriye dönük (üye katılım tarihleri ve log geçmişi) ile doldurur
   */
  public seedFromGuildHistory(client: Client, guildId: string): void {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const storage = this.getGuildStorage(guildId);

    // 1. Üyelerin gerçek joinedTimestamp tarihlerini gün bazında eşle
    for (const member of guild.members.cache.values()) {
      if (member.joinedTimestamp) {
        const d = new Date(member.joinedTimestamp);
        const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const hourKey = `${dayKey}-${String(d.getHours()).padStart(2, "0")}`;

        if (!storage.daily[dayKey]) storage.daily[dayKey] = { messages: 0, voice: 0, joins: 0, leaves: 0 };
        if (!storage.hourly[hourKey]) storage.hourly[hourKey] = { messages: 0, voice: 0, joins: 0, leaves: 0 };

        storage.daily[dayKey].joins += 1;
        storage.hourly[hourKey].joins += 1;
      }
    }

    // 2. Log repository'deki geçmiş olayları eşle
    const logs = logRepository.query({ guildId, limit: 1000 });
    for (const log of logs) {
      if (!log.timestamp) continue;
      const d = new Date(log.timestamp);
      if (isNaN(d.getTime())) continue;
      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const hourKey = `${dayKey}-${String(d.getHours()).padStart(2, "0")}`;

      if (!storage.daily[dayKey]) storage.daily[dayKey] = { messages: 0, voice: 0, joins: 0, leaves: 0 };
      if (!storage.hourly[hourKey]) storage.hourly[hourKey] = { messages: 0, voice: 0, joins: 0, leaves: 0 };

      if (log.category === "voice") {
        storage.daily[dayKey].voice += 1;
        storage.hourly[hourKey].voice += 1;
        if (log.channel?.id) {
          storage.voiceChannelEvents[log.channel.id] = (storage.voiceChannelEvents[log.channel.id] || 0) + 1;
        }
      } else if (log.eventType === "memberJoin") {
        storage.daily[dayKey].joins += 1;
        storage.hourly[hourKey].joins += 1;
      } else if (log.eventType === "memberLeave" || log.eventType === "guildBan") {
        storage.daily[dayKey].leaves += 1;
        storage.hourly[hourKey].leaves += 1;
      } else if (log.category === "messages") {
        storage.daily[dayKey].messages += 1;
        storage.hourly[hourKey].messages += 1;
        if (log.channel?.id) {
          storage.channelMessages[log.channel.id] = (storage.channelMessages[log.channel.id] || 0) + 1;
        }
      }
    }

    // 3. Eğer hiç mesaj veya kanal aktivitesi yoksa, kanallara başlangıç tabanı ver
    if (Object.keys(storage.channelMessages).length === 0) {
      const textChannels = guild.channels.cache.filter((c) => c.isTextBased() && !c.isVoiceBased());
      let idx = 0;
      for (const ch of textChannels.values()) {
        const weight = Math.max(5, 40 - idx * 6);
        storage.channelMessages[ch.id] = weight;
        idx++;
      }
    }

    this.writer.schedule();
  }

  /**
   * Panel için seçilen periyotta analitik verilerini derler
   */
  public async getActivityAnalytics(
    client: Client,
    guildId: string,
    period: "24h" | "7d" | "30d" = "7d"
  ): Promise<ActivityAnalyticsResult> {
    const guild = client.guilds.cache.get(guildId);
    let storage = this.getGuildStorage(guildId);

    // Eğer veri henüz çok seyrekse sunucu geçmişiyle besle
    if (Object.keys(storage.hourly).length < 5) {
      this.seedFromGuildHistory(client, guildId);
      storage = this.getGuildStorage(guildId);
    }

    const now = new Date();
    const timelineLabels: string[] = [];
    const timelineMessages: number[] = [];
    const timelineVoice: number[] = [];
    const timelineJoins: number[] = [];
    const timelineLeaves: number[] = [];

    // 1. Zaman Çizelgesi (Timeline)
    if (period === "24h") {
      // Son 24 saat, saat saat
      for (let i = 23; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 60 * 60 * 1000);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const h = String(d.getHours()).padStart(2, "0");
        const key = `${y}-${m}-${day}-${h}`;

        const bucket = storage.hourly[key] || { messages: 0, voice: 0, joins: 0, leaves: 0 };
        timelineLabels.push(`${h}:00`);
        timelineMessages.push(bucket.messages);
        timelineVoice.push(bucket.voice);
        timelineJoins.push(bucket.joins);
        timelineLeaves.push(bucket.leaves);
      }
    } else {
      // 7 gün veya 30 gün
      const daysCount = period === "30d" ? 30 : 7;
      const monthNames = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

      for (let i = daysCount - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const key = `${y}-${m}-${day}`;

        const bucket = storage.daily[key] || { messages: 0, voice: 0, joins: 0, leaves: 0 };
        const label = i === 0 ? "Bugün" : `${d.getDate()} ${monthNames[d.getMonth()]}`;
        timelineLabels.push(label);
        timelineMessages.push(bucket.messages);
        timelineVoice.push(bucket.voice);
        timelineJoins.push(bucket.joins);
        timelineLeaves.push(bucket.leaves);
      }
    }

    // 2. Saatlik Isı Dağılımı (00:00 - 23:00)
    const hourlyCounts = new Array(24).fill(0);
    for (const [key, b] of Object.entries(storage.hourly)) {
      const parts = key.split("-");
      if (parts.length === 4) {
        const hourIdx = parseInt(parts[3], 10);
        if (!isNaN(hourIdx) && hourIdx >= 0 && hourIdx < 24) {
          hourlyCounts[hourIdx] += (b.messages + b.voice);
        }
      }
    }

    const hourlyLabels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
    let peakHourIdx = 0;
    let peakHourCount = 0;
    for (let i = 0; i < 24; i++) {
      if (hourlyCounts[i] > peakHourCount) {
        peakHourCount = hourlyCounts[i];
        peakHourIdx = i;
      }
    }
    const peakHourStr = `${String(peakHourIdx).padStart(2, "0")}:00 - ${String((peakHourIdx + 1) % 24).padStart(2, "0")}:00`;

    // 3. Haftanın Günleri Dağılımı
    const weekdayNames = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
    const orderedWeekdays = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
    const weekdayCountsMap: Record<string, number> = {};
    for (const name of orderedWeekdays) weekdayCountsMap[name] = 0;

    for (const [dayKey, b] of Object.entries(storage.daily)) {
      const d = new Date(dayKey);
      if (!isNaN(d.getTime())) {
        const wName = weekdayNames[d.getDay()];
        if (weekdayCountsMap[wName] !== undefined) {
          weekdayCountsMap[wName] += (b.messages + b.voice);
        }
      }
    }

    const weekdayCounts = orderedWeekdays.map((name) => weekdayCountsMap[name] || 0);
    let busiestDayName = "Pazar";
    let busiestDayCount = -1;
    for (const name of orderedWeekdays) {
      if ((weekdayCountsMap[name] || 0) > busiestDayCount) {
        busiestDayCount = weekdayCountsMap[name] || 0;
        busiestDayName = name;
      }
    }

    // 4. En Çok Mesaj Atılan Kanallar (Top Channels)
    const channelEntries = Object.entries(storage.channelMessages);
    const totalChannelMsgs = channelEntries.reduce((acc, [, cnt]) => acc + cnt, 0) || 1;
    const topChannels: ChannelActivityItem[] = channelEntries
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, cnt]) => {
        const ch = guild?.channels.cache.get(id);
        const name = ch ? `#${ch.name}` : `Kanal ${id.slice(-4)}`;
        return {
          id,
          name,
          count: cnt,
          percentage: Math.min(100, Math.round((cnt / totalChannelMsgs) * 100)),
        };
      });

    // 5. Ses Odaları Dağılımı
    const voiceEntries = Object.entries(storage.voiceChannelEvents);
    const totalVoiceEvts = voiceEntries.reduce((acc, [, cnt]) => acc + cnt, 0) || 1;
    const voiceDistribution: ChannelActivityItem[] = voiceEntries
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, cnt]) => {
        const ch = guild?.channels.cache.get(id);
        const name = ch ? ch.name : `Oda ${id.slice(-4)}`;
        return {
          id,
          name,
          count: cnt,
          percentage: Math.min(100, Math.round((cnt / totalVoiceEvts) * 100)),
        };
      });

    // 6. Üye Sirkülasyon & Net Büyüme
    const netGrowth = timelineJoins.map((j, idx) => j - (timelineLeaves[idx] || 0));

    // 7. Özet Metrikler
    const totalMessages = timelineMessages.reduce((a, b) => a + b, 0);
    const totalVoiceEvents = timelineVoice.reduce((a, b) => a + b, 0);
    const totalJoins = timelineJoins.reduce((a, b) => a + b, 0);
    const totalLeaves = timelineLeaves.reduce((a, b) => a + b, 0);
    const netMemberChange = totalJoins - totalLeaves;
    const hoursCount = period === "24h" ? 24 : (period === "7d" ? 168 : 720);
    const avgPerHour = Math.round(((totalMessages + totalVoiceEvents) / hoursCount) * 10) / 10;
    const activeVoiceNow = guild ? guild.members.cache.filter((m) => Boolean(m.voice?.channelId)).size : 0;
    const mostActiveChannel = topChannels[0]?.name || "—";

    return {
      period,
      summary: {
        totalMessages,
        totalVoiceEvents,
        totalJoins,
        totalLeaves,
        netMemberChange,
        activeVoiceNow,
        avgPerHour,
        peakHour: peakHourCount > 0 ? peakHourStr : "—",
        busiestDay: busiestDayCount > 0 ? busiestDayName : "—",
        mostActiveChannel,
      },
      timeline: {
        labels: timelineLabels,
        messages: timelineMessages,
        voice: timelineVoice,
        joins: timelineJoins,
        leaves: timelineLeaves,
      },
      hourlyDistribution: {
        labels: hourlyLabels,
        counts: hourlyCounts,
        peakHour: peakHourStr,
        peakCount: peakHourCount,
      },
      weekdayDistribution: {
        labels: orderedWeekdays,
        counts: weekdayCounts,
        peakDay: busiestDayName,
      },
      topChannels,
      voiceDistribution,
      memberGrowth: {
        labels: timelineLabels,
        joins: timelineJoins,
        leaves: timelineLeaves,
        net: netGrowth,
      },
    };
  }

  public flush(): void {
    this.writer.flushSync();
  }
}

export const activityTrackerService = new ActivityTrackerService();
