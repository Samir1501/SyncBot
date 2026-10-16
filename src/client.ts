import {
  Client,
  GatewayIntentBits,
  Options,
  Partials,
} from "discord.js";
import { config } from "./config.js";

/**
 * Single Responsibility (SRP): Discord.js istemcisini (Client) RAM optimizasyonlu
 * önbellek ve temizleyici (sweeper) politikalarıyla yapılandırıp oluşturur.
 */
export function createBotClient(): Client {
  const messageLifetimeMs = config.cache.messageLifetimeHours * 60 * 60 * 1000;

  return new Client({
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
}
