import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../settings/defaults.js";
import { createDebouncedJsonWriter, type DebouncedJsonWriter } from "../utils/jsonFile.js";

export type ActivityType =
  | "member_join"
  | "member_leave"
  | "message_delete"
  | "voice"
  | "welcome"
  | "announcement"
  | "bot"
  | "feed"
  | "steam";

export interface ActivityEvent {
  id: string;
  guildId?: string;
  type: ActivityType;
  title: string;
  desc: string;
  time: string;
  icon: string;
  color: string;
}

/**
 * Dependency Inversion (DIP) için aktivite takip deposu sözleşmesi.
 */
export interface IActivityRepository {
  add(event: Omit<ActivityEvent, "id" | "time">): void;
  getRecent(guildId?: string, limit?: number): ActivityEvent[];
  flush(): void;
}

const DEFAULT_ACTIVITIES_FILE = path.join(DATA_DIR, "activities.json");
const DEFAULT_MAX_ACTIVITIES = 100;

export class FileActivityRepository implements IActivityRepository {
  private activities: ActivityEvent[] = [];
  private readonly writer: DebouncedJsonWriter;
  private readonly maxActivities: number;

  constructor(filePath: string = DEFAULT_ACTIVITIES_FILE, maxActivities: number = DEFAULT_MAX_ACTIVITIES) {
    this.maxActivities = maxActivities;
    this.loadFromDisk(filePath);
    if (this.activities.length === 0) {
      this.activities.push({
        id: "init-1",
        type: "bot",
        title: "Sistem Aktif",
        desc: "Bot ve yönetim paneli başarıyla başlatıldı",
        time: new Date().toISOString(),
        icon: "bolt",
        color: "#FFE000",
      });
    }
    this.writer = createDebouncedJsonWriter(filePath, () => this.activities, 1000, "ActivityTracker");
  }

  private loadFromDisk(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.activities = parsed;
        }
      }
    } catch (err) {
      console.error("[ActivityTracker] Aktiviteler diskten okunurken hata oluştu:", err);
    }
  }

  public add(event: Omit<ActivityEvent, "id" | "time">): void {
    this.activities.unshift({
      ...event,
      id: Math.random().toString(36).slice(2, 9),
      time: new Date().toISOString(),
    });
    if (this.activities.length > this.maxActivities) {
      this.activities.length = this.maxActivities;
    }
    this.writer.schedule();
  }

  public getRecent(guildId?: string, limit = 10): ActivityEvent[] {
    if (guildId) {
      const list = this.activities.filter((a) => !a.guildId || a.guildId === guildId);
      return list.slice(0, limit);
    }
    return this.activities.slice(0, limit);
  }

  public flush(): void {
    this.writer.flushSync();
  }
}

export const activityRepository = new FileActivityRepository();
