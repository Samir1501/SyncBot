import { createBotClient } from "./client.js";
import { config, validateConfig } from "./config.js";
import { startDashboard } from "./dashboard/server.js";
import { registerBotEvents } from "./events/index.js";
import { activityRepository } from "./repositories/activityRepository.js";
import { logRepository } from "./repositories/logRepository.js";
import { startSteamWatcher, stopSteamWatcher } from "./services/steamWatcher.js";

// .env doğrulaması yap
if (!validateConfig()) {
  process.exit(1);
}

// Bot istemcisini oluştur ve olay dinleyicilerini (Event Registry) bağla
const client = createBotClient();
registerBotEvents(client);

// Web yönetim panelini başlat
startDashboard(client);

// Steam oyun güncelleme izleme servisini başlat
startSteamWatcher(client);

// Global hata yakalama (botun beklenmedik şekilde çökmesini önler)
process.on("unhandledRejection", (error) => {
  console.error("⚠️ [Yakalanmamış Hata - Unhandled Rejection]:", error);
});

process.on("uncaughtException", (error) => {
  console.error("⚠️ [Kritik Hata - Uncaught Exception]:", error);
});

// Düzgün kapanış: systemd / pm2 yeniden başlatmalarında (SIGTERM) veya Ctrl+C (SIGINT)
// bekleyen log ve aktivite kayıtlarını diske yazıp Discord bağlantısını kapatır.
let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`🛑 [${signal}] Bot kapatılıyor, bekleyen veriler diske yazılıyor...`);
  stopSteamWatcher();
  logRepository.flush();
  activityRepository.flush();
  // Bağlantı kapanışı takılırsa en geç 3 saniye sonra çık
  setTimeout(() => process.exit(0), 3000).unref();
  client
    .destroy()
    .catch(() => null)
    .finally(() => process.exit(0));
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

// Botu başlat
client.login(config.token).catch((err) => {
  console.error(
    "❌ Bot giriş yapamadı! Token'ın doğruluğunu ve internet bağlantınızı kontrol edin."
  );
  console.error(err);
});
