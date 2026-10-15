import {
  Client,
  Events,
  GatewayIntentBits,
  Options,
  Partials,
} from "discord.js";
import { config, validateConfig } from "./config.js";
import { handleGuildMemberAdd } from "./events/guildMemberAdd.js";
import { handleGuildMemberRemove } from "./events/guildMemberRemove.js";
import { handleGuildMemberUpdate } from "./events/guildMemberUpdate.js";
import { handleGuildBanAdd } from "./events/guildBanAdd.js";
import { handleGuildBanRemove } from "./events/guildBanRemove.js";
import { handleMessageDelete } from "./events/messageDelete.js";
import { handleMessageCreate } from "./events/messageCreate.js";
import { handleThreadCreate } from "./events/threadCreate.js";
import { handleMessageUpdate } from "./events/messageUpdate.js";
import { handleReady } from "./events/ready.js";
import { handleVoiceStateUpdate } from "./events/voiceStateUpdate.js";
import { startDashboard } from "./dashboard/server.js";
import { handleWelcome } from "./welcome/sendWelcome.js";
import { flushLogStore } from "./utils/logStore.js";
import { flushActivities } from "./utils/activityTracker.js";

// .env doğrulaması yap
if (!validateConfig()) {
  process.exit(1);
}

const messageLifetimeMs = config.cache.messageLifetimeHours * 60 * 60 * 1000;

// Bot istemcisini gerekli Intent ve Partials ile oluştur
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    // NOT: GuildMessageReactions kaldırıldı; botta tepki (reaction) olayı dinlenmiyordu.
    // Gereksiz gateway trafiği ve mesaj nesnelerinde tepki önbelleği oluşmasını engeller.
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.GuildMember,
    Partials.User,
  ],
  // RAM optimizasyonu: Botun hiç kullanmadığı önbellekler kapatılır, mesaj önbelleği sınırlandırılır.
  // Üye (GuildMember), kullanıcı, kanal, rol, ses durumu ve thread önbellekleri KORUNUR;
  // rol/takma ad logları, ses logları ve panel bu önbelleklere ihtiyaç duyar.
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: config.cache.messagesPerChannel,
    ReactionManager: 0,
    ReactionUserManager: 0,
    PresenceManager: 0,
    GuildEmojiManager: 0,
    GuildStickerManager: 0,
    GuildScheduledEventManager: 0,
    StageInstanceManager: 0,
    AutoModerationRuleManager: 0,
    ApplicationCommandManager: 0,
    GuildInviteManager: 0,
    GuildBanManager: 0,
  }),
  sweepers: {
    ...Options.DefaultSweeperSettings,
    // Her 30 dakikada bir: botun kendi gönderdiği mesajlar (log/akış/karşılama embedleri)
    // ve ayarlanan süreden eski mesajlar önbellekten temizlenir.
    messages: {
      interval: 30 * 60,
      filter: () => {
        const cutoff = messageLifetimeMs > 0 ? Date.now() - messageLifetimeMs : 0;
        return (message) =>
          message.author?.id === message.client.user?.id ||
          (cutoff > 0 && (message.editedTimestamp ?? message.createdTimestamp) < cutoff);
      },
    },
  },
});

// Olay dinleyicilerini (Event Listeners) bağla
client.once(Events.ClientReady, () => handleReady(client));
client.on(Events.MessageCreate, (message) => handleMessageCreate(message));
client.on(Events.ThreadCreate, (thread) => handleThreadCreate(thread));
client.on(Events.MessageDelete, (message) => handleMessageDelete(message));
client.on(Events.MessageUpdate, (oldMsg, newMsg) => handleMessageUpdate(oldMsg, newMsg));
client.on(Events.VoiceStateUpdate, (oldState, newState) => handleVoiceStateUpdate(oldState, newState));
client.on(Events.GuildMemberAdd, (member) => handleGuildMemberAdd(member));
client.on(Events.GuildMemberAdd, (member) => handleWelcome(member));
client.on(Events.GuildMemberRemove, (member) => handleGuildMemberRemove(member));
client.on(Events.GuildMemberUpdate, (oldMem, newMem) => handleGuildMemberUpdate(oldMem, newMem));
client.on(Events.GuildBanAdd, (ban) => handleGuildBanAdd(ban));
client.on(Events.GuildBanRemove, (ban) => handleGuildBanRemove(ban));

// Web yönetim panelini başlat
startDashboard(client);

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
  flushLogStore();
  flushActivities();
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
  console.error("❌ Bot giriş yapamadı! Token'ın doğruluğunu ve internet bağlantınızı kontrol edin.");
  console.error(err);
});
