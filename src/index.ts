import {
  Client,
  Events,
  GatewayIntentBits,
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

// .env doğrulaması yap
if (!validateConfig()) {
  process.exit(1);
}

// Bot istemcisini gerekli Intent ve Partials ile oluştur
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.GuildMember,
    Partials.User,
    Partials.Reaction,
  ],
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

// Botu başlat
client.login(config.token).catch((err) => {
  console.error("❌ Bot giriş yapamadı! Token'ın doğruluğunu ve internet bağlantınızı kontrol edin.");
  console.error(err);
});
