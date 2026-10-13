import dotenv from "dotenv";

dotenv.config();

export const config = {
  token: process.env.DISCORD_TOKEN?.trim() || "",
  logChannelId: process.env.LOG_CHANNEL_ID?.trim() || "",
  dashboard: {
    port: Number(process.env.DASHBOARD_PORT) || 3000,
    // Varsayılan olarak sadece bu bilgisayardan erişilebilir
    host: process.env.DASHBOARD_HOST?.trim() || "127.0.0.1",
    password: process.env.DASHBOARD_PASSWORD?.trim() || "",
  },
};

export function validateConfig(): boolean {
  if (!config.token) {
    console.error("❌ HATA: .env dosyasında DISCORD_TOKEN tanımlanmamış!");
    console.error("Lütfen .env dosyasını açıp bot tokeninizi DISCORD_TOKEN alanına yapıştırın.");
    return false;
  }
  if (!config.logChannelId) {
    console.warn("⚠️ UYARI: .env dosyasında LOG_CHANNEL_ID tanımlanmamış!");
    console.warn("Log kanalını web panelinden de seçebilirsiniz.");
  }
  if (config.dashboard.host !== "127.0.0.1" && config.dashboard.host !== "localhost" && !config.dashboard.password) {
    console.warn("⚠️ UYARI: Panel dış ağa açık ama DASHBOARD_PASSWORD tanımlanmamış! Herkes ayarları değiştirebilir.");
  }
  return true;
}
