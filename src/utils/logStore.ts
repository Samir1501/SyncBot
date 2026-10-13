import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../settings.js";

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

export interface LogRecord {
  id: string;
  guildId: string;
  category: LogCategory;
  eventType: LogEventType;
  title: string;
  description: string;
  user?: {
    id: string;
    tag: string;
    avatarUrl?: string;
    isBot?: boolean;
  };
  channel?: {
    id: string;
    name: string;
  };
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

const MAX_STORED_LOGS = 2000;
const LOGS_FILE = path.join(DATA_DIR, "logs.json");

let logStore: LogRecord[] = [];

// Başlangıçta kayıtlı logları diskten güvenle yükle
try {
  if (fs.existsSync(LOGS_FILE)) {
    const raw = fs.readFileSync(LOGS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      logStore = parsed;
    }
  }
} catch (err) {
  console.error("[LogStore] Kayıtlı loglar diskten okunurken hata oluştu:", err);
  logStore = [];
}

let saveTimer: NodeJS.Timeout | null = null;

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(LOGS_FILE, JSON.stringify(logStore, null, 2), "utf-8");
    } catch (err) {
      console.error("[LogStore] Loglar diske kaydedilemedi:", err);
    }
  }, 500); // 500ms debounce disk yazma
}

/**
 * Yeni bir denetim kaydını hafıza kuyruğuna ekler ve diske kalıcı olarak kaydeder.
 */
export function addLogRecord(
  record: Omit<LogRecord, "id" | "timestamp">
): LogRecord {
  const newRecord: LogRecord = {
    ...record,
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
  };

  logStore.unshift(newRecord);
  if (logStore.length > MAX_STORED_LOGS) {
    logStore.length = MAX_STORED_LOGS;
  }

  scheduleSave();
  return newRecord;
}

/**
 * Denetim kayıtlarını filtrelere ve arama kriterlerine göre sorgular.
 */
export function queryLogs(options: LogQueryOptions = {}): LogRecord[] {
  const { guildId, category, eventType, search, limit = 50 } = options;
  const searchLower = search ? search.trim().toLowerCase() : "";

  let filtered = logStore;

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

/**
 * Sunucuya veya genel belleğe ait kayıtları temizler ve diski günceller.
 */
export function clearLogs(guildId?: string): void {
  if (!guildId) {
    logStore.length = 0;
  } else {
    for (let i = logStore.length - 1; i >= 0; i--) {
      if (logStore[i].guildId === guildId) {
        logStore.splice(i, 1);
      }
    }
  }
  scheduleSave();
}
