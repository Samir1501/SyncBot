import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../settings/defaults.js";
import { createDebouncedJsonWriter, type DebouncedJsonWriter } from "../utils/jsonFile.js";

export type LogCategory = "messages" | "members" | "voice" | "moderation";

export type LogEventType =
  | "messageDelete"
  | "messageUpdate"
  | "memberJoin"
  | "memberLeave"
  | "memberUpdate"
  | "voiceJoinLeave"
  | "voiceMuteDeafen"
  | "guildBan";

export interface LogUserSummary {
  id: string;
  tag: string;
  avatarUrl?: string;
  isBot?: boolean;
}

export interface LogChannelSummary {
  id: string;
  name: string;
}

export interface LogRecord {
  id: string;
  guildId: string;
  category: LogCategory;
  eventType: LogEventType;
  title: string;
  description: string;
  user?: LogUserSummary;
  channel?: LogChannelSummary;
  details?: Record<string, string | number | boolean>;
  timestamp: string; // ISO String
  color: string;
}

export interface LogQueryOptions {
  guildId?: string;
  category?: string;
  eventType?: string;
  search?: string;
  limit?: number;
}

/**
 * Dependency Inversion (DIP) için denetim kaydı (log) deposu sözleşmesi.
 */
export interface ILogRepository {
  add(record: Omit<LogRecord, "id" | "timestamp">): LogRecord;
  query(options?: LogQueryOptions): LogRecord[];
  clear(guildId?: string): void;
  flush(): void;
}

const DEFAULT_MAX_STORED_LOGS = 2000;
const DEFAULT_LOGS_FILE = path.join(DATA_DIR, "logs.json");

export class FileLogRepository implements ILogRepository {
  private records: LogRecord[] = [];
  private readonly writer: DebouncedJsonWriter;
  private readonly maxRecords: number;

  constructor(filePath: string = DEFAULT_LOGS_FILE, maxRecords: number = DEFAULT_MAX_STORED_LOGS) {
    this.maxRecords = maxRecords;
    this.loadFromDisk(filePath);
    this.writer = createDebouncedJsonWriter(filePath, () => this.records, 2000, "LogStore");
  }

  private loadFromDisk(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.records = parsed;
        }
      }
    } catch (err) {
      console.error("[LogStore] Kayıtlı loglar diskten okunurken hata oluştu:", err);
      this.records = [];
    }
  }

  public add(record: Omit<LogRecord, "id" | "timestamp">): LogRecord {
    const newRecord: LogRecord = {
      ...record,
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
    };

    this.records.unshift(newRecord);
    if (this.records.length > this.maxRecords) {
      this.records.length = this.maxRecords;
    }

    this.writer.schedule();
    return newRecord;
  }

  public query(options: LogQueryOptions = {}): LogRecord[] {
    const { guildId, category, eventType, search, limit = 50 } = options;
    const searchLower = search ? search.trim().toLowerCase() : "";

    let filtered = this.records;

    if (guildId) {
      filtered = filtered.filter((l) => l.guildId === guildId);
    }

    if (category && category !== "all") {
      filtered = filtered.filter((l) => l.category === category);
    }

    if (eventType && eventType !== "all") {
      filtered = filtered.filter((l) => l.eventType === eventType);
    }

    if (searchLower) {
      filtered = filtered.filter((l) => {
        if (l.title.toLowerCase().includes(searchLower)) return true;
        if (l.description.toLowerCase().includes(searchLower)) return true;
        if (l.user?.tag.toLowerCase().includes(searchLower)) return true;
        if (l.user?.id.includes(searchLower)) return true;
        if (l.channel?.name.toLowerCase().includes(searchLower)) return true;
        if (l.channel?.id.includes(searchLower)) return true;
        return false;
      });
    }

    return filtered.slice(0, Math.min(Math.max(limit, 1), 200));
  }

  public clear(guildId?: string): void {
    if (!guildId) {
      this.records.length = 0;
    } else {
      for (let i = this.records.length - 1; i >= 0; i--) {
        if (this.records[i].guildId === guildId) {
          this.records.splice(i, 1);
        }
      }
    }
    this.writer.schedule();
  }

  public flush(): void {
    this.writer.flushSync();
  }
}

export const logRepository = new FileLogRepository();
