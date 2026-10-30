import { Events, type Client, type ClientEvents } from "discord.js";
import { handleWelcome } from "../welcome/sendWelcome.js";
import { handleGuildBanAdd } from "./guildBanAdd.js";
import { handleGuildBanRemove } from "./guildBanRemove.js";
import { handleGuildCreate } from "./guildCreate.js";
import { handleGuildDelete } from "./guildDelete.js";
import { handleGuildMemberAdd } from "./guildMemberAdd.js";
import { handleGuildMemberRemove } from "./guildMemberRemove.js";
import { handleGuildMemberUpdate } from "./guildMemberUpdate.js";
import { handleMessageCreate } from "./messageCreate.js";
import { handleMessageDelete } from "./messageDelete.js";
import { handleMessageUpdate } from "./messageUpdate.js";
import { handleReady } from "./ready.js";
import { handleThreadCreate } from "./threadCreate.js";
import { handleVoiceStateUpdate } from "./voiceStateUpdate.js";

export interface BotEventRegistration<K extends keyof ClientEvents = keyof ClientEvents> {
  event: K;
  once?: boolean;
  execute: (...args: any[]) => Promise<void> | void;
}

function defineEvent<K extends keyof ClientEvents>(
  registration: {
    event: K;
    once?: boolean;
    execute: (...args: ClientEvents[K]) => Promise<void> | void;
  }
): BotEventRegistration<any> {
  return registration as BotEventRegistration<any>;
}

/**
 * Open/Closed Principle (OCP): Yeni bir Discord olayı dinlemek için `index.ts` dosyasını
 * değiştirmek yerine yalnızca bu kayıt listesine yeni bir tanımlama eklemek yeterlidir.
 */
export const botEventRegistry: BotEventRegistration<any>[] = [
  defineEvent({
    event: Events.ClientReady,
    once: true,
    execute: (client) => handleReady(client),
  }),
  defineEvent({
    event: Events.GuildCreate,
    execute: (guild) => handleGuildCreate(guild),
  }),
  defineEvent({
    event: Events.GuildDelete,
    execute: (guild) => handleGuildDelete(guild),
  }),
  defineEvent({
    event: Events.MessageCreate,
    execute: (message) => handleMessageCreate(message),
  }),
  defineEvent({
    event: Events.ThreadCreate,
    execute: (thread) => handleThreadCreate(thread),
  }),
  defineEvent({
    event: Events.MessageDelete,
    execute: (message) => handleMessageDelete(message),
  }),
  defineEvent({
    event: Events.MessageUpdate,
    execute: (oldMsg, newMsg) => handleMessageUpdate(oldMsg, newMsg),
  }),
  defineEvent({
    event: Events.VoiceStateUpdate,
    execute: (oldState, newState) => handleVoiceStateUpdate(oldState, newState),
  }),
  defineEvent({
    event: Events.GuildMemberAdd,
    execute: (member) => handleGuildMemberAdd(member),
  }),
  defineEvent({
    event: Events.GuildMemberAdd,
    execute: (member) => handleWelcome(member),
  }),
  defineEvent({
    event: Events.GuildMemberRemove,
    execute: (member) => handleGuildMemberRemove(member),
  }),
  defineEvent({
    event: Events.GuildMemberUpdate,
    execute: (oldMem, newMem) => handleGuildMemberUpdate(oldMem, newMem),
  }),
  defineEvent({
    event: Events.GuildBanAdd,
    execute: (ban) => handleGuildBanAdd(ban),
  }),
  defineEvent({
    event: Events.GuildBanRemove,
    execute: (ban) => handleGuildBanRemove(ban),
  }),
];

export function registerBotEvents(
  client: Client,
  events: BotEventRegistration<any>[] = botEventRegistry
): void {
  for (const reg of events) {
    if (reg.once) {
      client.once(reg.event, (...args) => void reg.execute(...args));
    } else {
      client.on(reg.event, (...args) => void reg.execute(...args));
    }
  }
}
