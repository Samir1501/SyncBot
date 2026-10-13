import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../settings.js";

export interface ActivityEvent {
  id: string;
  guildId?: string;
  type: "member_join" | "member_leave" | "message_delete" | "voice" | "welcome" | "announcement" | "bot" | "feed";
  title: string;
  desc: string;
  time: string;
  icon: string;
  color: string;
}

const ACTIVITIES_FILE = path.join(DATA_DIR, "activities.json");
const MAX_ACTIVITIES = 100;

let activities: ActivityEvent[] = [];

// Başlangıçta kayıtlı aktiviteleri diskten yükle
try {
  if (fs.existsSync(ACTIVITIES_FILE)) {
    const raw = fs.readFileSync(ACTIVITIES_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      activities = parsed;
    }
  }
} catch (err) {
  console.error("[ActivityTracker] Aktiviteler diskten okunurken hata oluştu:", err);
}

if (activities.length === 0) {
  activities.push({
    id: "init-1",
    type: "bot",
    title: "Sistem Aktif",
    desc: "Bot ve yönetim paneli başarıyla başlatıldı",
    time: new Date().toISOString(),
    icon: "bolt",
    color: "#FFE000",
  });
}

function persistActivities(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(ACTIVITIES_FILE, JSON.stringify(activities, null, 2), "utf-8");
  } catch (err) {
    console.error("[ActivityTracker] Aktiviteler diske kaydedilemedi:", err);
  }
}

export function addActivity(event: Omit<ActivityEvent, "id" | "time">): void {
  activities.unshift({
    ...event,
    id: Math.random().toString(36).slice(2, 9),
    time: new Date().toISOString(),
  });
  if (activities.length > MAX_ACTIVITIES) {
    activities.length = MAX_ACTIVITIES;
  }
  persistActivities();
}

export function getActivities(guildId?: string): ActivityEvent[] {
  if (guildId) {
    const list = activities.filter((a) => !a.guildId || a.guildId === guildId);
    return list.slice(0, 10);
  }
  return activities.slice(0, 10);
}
