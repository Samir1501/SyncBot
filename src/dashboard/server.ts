import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, PermissionFlagsBits, version as djsVersion, type Client, type Guild } from "discord.js";
import { config } from "../config.js";
import { getGuildSettings, saveGuildSettings, sanitizeGuildSettings, UPLOADS_DIR } from "../settings.js";
import { renderWelcomeCard, type CardData } from "../welcome/cardRenderer.js";
import { sendWelcome } from "../welcome/sendWelcome.js";
import { addActivity, getActivities } from "../utils/activityTracker.js";
import { queryLogs, clearLogs } from "../utils/logStore.js";
import { sendLog } from "../utils/logger.js";

const PUBLIC_DIR = path.join(process.cwd(), "public");

/**
 * Tüm üye listesini Discord'dan çekme (guild.members.fetch) maliyetli bir işlemdir:
 * gateway hız limitine tabidir ve büyük sunucularda anlık bellek sıçramasına yol açar.
 * - Aynı sunucu için eşzamanlı istekler tek bir fetch'te birleştirilir.
 * - Önbellek eksik kalsa bile (memberCount sapması vb.) kısa süre içinde tekrar tekrar fetch yapılmaz.
 */
const MEMBER_FETCH_COOLDOWN_MS = 60 * 1000;
const MEMBER_FORCE_FETCH_COOLDOWN_MS = 10 * 1000;
const lastMemberFetchAt = new Map<string, number>();
const pendingMemberFetches = new Map<string, Promise<void>>();

async function ensureMembersCached(guild: Guild, force = false): Promise<void> {
  if (!force && guild.members.cache.size >= guild.memberCount) return;

  const pending = pendingMemberFetches.get(guild.id);
  if (pending) return pending;

  const cooldown = force ? MEMBER_FORCE_FETCH_COOLDOWN_MS : MEMBER_FETCH_COOLDOWN_MS;
  if (Date.now() - (lastMemberFetchAt.get(guild.id) ?? 0) < cooldown) return;

  lastMemberFetchAt.set(guild.id, Date.now());
  const task = guild.members
    .fetch()
    .then(() => undefined)
    .catch((err) => {
      console.warn("[Panel] guild.members.fetch uyarısı:", err);
    })
    .finally(() => {
      pendingMemberFetches.delete(guild.id);
    });
  pendingMemberFetches.set(guild.id, task);
  return task;
}

function basicAuth(req: Request, res: Response, next: NextFunction): void {
  const password = config.dashboard.password;
  if (!password) return next();

  const header = req.headers.authorization ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const supplied = Buffer.from(encoded, "base64").toString("utf-8").split(":").slice(1).join(":");
    const a = Buffer.from(supplied);
    const b = Buffer.from(password);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
  }
  res.setHeader("WWW-Authenticate", 'Basic realm="Bot Paneli"');
  res.status(401).send("Yetkisiz erişim");
}

function sampleCardData(client: Client, guildId?: string): CardData {
  const guild = (guildId ? client.guilds.cache.get(guildId) : null) || client.guilds.cache.first();
  return {
    username: client.user?.username ?? "Kullanıcı",
    displayName: client.user?.displayName ?? "Kullanıcı",
    avatarUrl: client.user?.displayAvatarURL({ extension: "png", size: 512 }) ?? "",
    serverName: guild?.name ?? "Sunucu",
    memberCount: guild?.memberCount ?? 100,
  };
}

export function startDashboard(client: Client): void {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const app = express();
  app.use(basicAuth);
  app.use(express.json({ limit: "10mb" }));
  app.use(express.static(PUBLIC_DIR));
  app.use("/uploads", express.static(UPLOADS_DIR));

  // Sunucu listesi
  app.get("/api/guilds", (_req, res) => {
    const guilds = client.guilds.cache.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.iconURL({ extension: "png", size: 128 }),
      memberCount: g.memberCount,
    }));
    res.json(guilds);
  });

  // Seçili sunucunun ayarlarını getir
  app.get("/api/settings", (req, res) => {
    const guildId = String(req.query.guildId || "");
    res.json(getGuildSettings(guildId || null));
  });

  // Seçili sunucunun ayarlarını kaydet
  app.put("/api/settings", (req, res) => {
    const guildId = String(req.query.guildId || req.body?.guildId || "");
    if (!guildId) {
      res.status(400).json({ error: "Lütfen bir sunucu belirtin (guildId eksik)." });
      return;
    }
    res.json(saveGuildSettings(guildId, req.body));
  });

  app.get("/api/bot", (req, res) => {
    const guildId = String(req.query.guildId || "");
    res.json({ ready: client.isReady(), ...sampleCardData(client, guildId) });
  });

  // Dashboard İstatistikleri (Seçili sunucu + Bot genel durumu + Detaylar)
  app.get("/api/stats", async (req, res) => {
    const guildId = String(req.query.guildId || "");
    const guild = (guildId ? client.guilds.cache.get(guildId) : null) || client.guilds.cache.first();
    const settings = getGuildSettings(guildId || null);

    const textChannelsCount = guild?.channels.cache.filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement).size || 0;
    const voiceChannelsCount = guild?.channels.cache.filter((c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice).size || 0;
    const categoriesCount = guild?.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).size || 0;
    const rolesCount = guild?.roles.cache.size || 0;

    // Üyeleri eksiksiz önbelleğe al (Tüm botlar ve gerçek insanlar tam sayılsın)
    if (guild) {
      await ensureMembersCached(guild);
    }

    // Üye Dağılımı (İnsan vs Bot)
    let botCount = 0;
    let humanCount = 0;
    if (guild) {
      botCount = guild.members.cache.filter((m) => m.user.bot).size;
      humanCount = guild.members.cache.filter((m) => !m.user.bot).size;
      if (humanCount + botCount < guild.memberCount) {
        humanCount = Math.max(0, guild.memberCount - botCount);
      }
    }

    // Sunucu Sahibi
    let ownerInfo = null;
    if (guild) {
      try {
        const ownerUser = client.users.cache.get(guild.ownerId) || (await guild.fetchOwner().catch(() => null))?.user;
        if (ownerUser) {
          ownerInfo = {
            id: ownerUser.id,
            username: ownerUser.username,
            tag: ownerUser.tag,
            avatarUrl: ownerUser.displayAvatarURL({ extension: "png", size: 128 }),
          };
        }
      } catch {}
    }

    // Son Katılan Üyeler (Son 6 kişi)
    const recentMembers = guild
      ? guild.members.cache
          .filter((m) => !m.user.bot)
          .sort((a, b) => (b.joinedTimestamp || 0) - (a.joinedTimestamp || 0))
          .first(6)
          .map((m) => ({
            id: m.id,
            username: m.user.username,
            displayName: m.displayName,
            avatarUrl: m.user.displayAvatarURL({ extension: "png", size: 64 }),
            joinedAt: m.joinedAt ? m.joinedAt.toISOString() : null,
          }))
      : [];

    const boostTier = guild?.premiumTier || 0;
    const boostCount = guild?.premiumSubscriptionCount || 0;
    const nextTierTarget = boostTier === 0 ? 2 : boostTier === 1 ? 7 : boostTier === 2 ? 14 : 14;

    const totalMem = Math.round(os.totalmem() / 1024 / 1024);
    const usedMem = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const memPercent = Math.min(100, Math.round((usedMem / totalMem) * 100));

    res.json({
      bot: {
        username: client.user?.username || "Bot",
        tag: client.user?.tag || "Bot",
        avatarUrl: client.user?.displayAvatarURL({ extension: "png", size: 256 }) || "",
        ready: client.isReady(),
        ping: Math.round(client.ws.ping) || 0,
        uptimeSeconds: Math.floor(process.uptime()),
        totalGuilds: client.guilds.cache.size,
        totalUsers: client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0),
        memoryMB: usedMem,
        memoryTotalMB: totalMem,
        memoryPercent: memPercent,
        nodeVersion: process.version,
        djsVersion,
        platform: process.platform === "win32" ? "Windows" : process.platform,
      },
      guild: guild
        ? {
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL({ extension: "png", size: 256 }),
            memberCount: guild.memberCount,
            humanCount,
            botCount,
            textChannelsCount,
            voiceChannelsCount,
            categoriesCount,
            rolesCount,
            createdAt: (guild.createdAt && !isNaN(guild.createdAt.getTime())) ? guild.createdAt.toISOString() : new Date().toISOString(),
            joinedAt: (guild.joinedAt && !isNaN(guild.joinedAt.getTime())) ? guild.joinedAt.toISOString() : null,
            verificationLevel: guild.verificationLevel,
            explicitContentFilter: guild.explicitContentFilter,
            boostTier,
            boostCount,
            nextTierTarget,
            owner: ownerInfo,
            recentMembers,
            loggingEnabled: settings.logging.enabled,
            loggingChannelId: settings.logging.channelId,
            welcomeEnabled: settings.welcome.enabled,
            welcomeChannelId: settings.welcome.channelId,
            feedEnabled: settings.feed?.enabled || false,
            feedTargetChannelId: settings.feed?.targetChannelId || "",
          }
        : null,
      activities: getActivities(guild?.id),
    });
  });

  app.get("/api/channels", async (req, res) => {
    const filterGuildId = String(req.query.guildId || "");
    const channels: { id: string; name: string; guildId: string; guild: string; position: number; isForum?: boolean }[] = [];
    for (const guild of client.guilds.cache.values()) {
      if (filterGuildId && guild.id !== filterGuildId) continue;
      const guildChannels = guild.channels.cache.size > 0 ? guild.channels.cache : await guild.channels.fetch().catch(() => guild.channels.cache);
      for (const c of guildChannels.values()) {
        if (!c) continue;
        if (
          c.type === ChannelType.GuildText ||
          c.type === ChannelType.GuildAnnouncement ||
          c.type === ChannelType.GuildForum ||
          c.type === ChannelType.GuildMedia
        ) {
          channels.push({
            id: c.id,
            name: c.name,
            guildId: guild.id,
            guild: guild.name,
            position: c.position,
            isForum: c.type === ChannelType.GuildForum || c.type === ChannelType.GuildMedia,
          });
        }
      }
    }
    res.json(channels.sort((a, b) => a.guild.localeCompare(b.guild) || a.position - b.position));
  });

  app.post("/api/upload", (req, res) => {
    const match = /^data:image\/(png|jpeg|webp|gif);base64,(.+)$/.exec(String(req.body?.dataUrl ?? ""));
    if (!match) {
      res.status(400).json({ error: "Geçersiz görsel. PNG, JPG, WEBP veya GIF yükleyin." });
      return;
    }
    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    const fileName = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, fileName), Buffer.from(match[2], "base64"));
    res.json({ url: `/uploads/${fileName}` });
  });

  /** Kaydedilmemiş tasarımı sunucu motoruyla çizip PNG döndürür */
  app.post("/api/preview", async (req, res) => {
    try {
      const guildId = String(req.query.guildId || req.body?.guildId || "");
      const card = sanitizeGuildSettings({ welcome: { card: req.body?.card } }).welcome.card;
      const png = await renderWelcomeCard(card, sampleCardData(client, guildId));
      res.type("png").send(png);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  /** Kayıtlı ayarlarla karşılama kanalına test kartı gönderir */
  app.post("/api/welcome/test", async (req, res) => {
    const guildId = String(req.query.guildId || req.body?.guildId || "");
    const { welcome } = getGuildSettings(guildId);
    try {
      if (!welcome.channelId) throw new Error("Önce bir karşılama kanalı seçip kaydedin.");
      const channel = await client.channels.fetch(welcome.channelId).catch(() => null);
      if (!channel || channel.isDMBased() || !channel.isTextBased()) throw new Error("Karşılama kanalı bulunamadı.");
      const member = await channel.guild.members.fetchMe();
      await sendWelcome(member, channel);
      addActivity({
        guildId: channel.guild.id,
        type: "welcome",
        title: "Test Karşılama Kartı",
        desc: `#${channel.name} kanalına test kartı basıldı`,
        icon: "vial",
        color: "#FFE000",
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /** Panelden seçilen kanala mesaj veya duyuru gönderir */
  app.post("/api/messages/send", async (req, res) => {
    try {
      const { channelId, content, isEmbed, embedTitle, embedColor, embedDescription } = req.body || {};

      if (!channelId) {
        res.status(400).json({ error: "Lütfen bir kanal seçin." });
        return;
      }

      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel || channel.isDMBased() || !channel.isTextBased()) {
        res.status(404).json({ error: "Kanal bulunamadı veya bota mesaj gönderme izni yok." });
        return;
      }

      if (isEmbed) {
        if (!embedTitle && !embedDescription) {
          res.status(400).json({ error: "Duyuru için en az bir başlık veya açıklama girmelisiniz." });
          return;
        }

        const colorHex = (embedColor || "#FFE000").replace("#", "");
        const colorInt = parseInt(colorHex, 16) || 0xffe000;

        await channel.send({
          content: content?.trim() ? content.trim() : undefined,
          embeds: [
            {
              title: embedTitle?.trim() || undefined,
              description: embedDescription?.trim() || undefined,
              color: colorInt,
              footer: {
                text: `${channel.guild.name} • Yönetim Paneli`,
                icon_url: channel.guild.iconURL() || undefined,
              },
              timestamp: new Date().toISOString(),
            },
          ],
        });
      } else {
        if (!content || !content.trim()) {
          res.status(400).json({ error: "Lütfen göndermek istediğiniz mesajı yazın." });
          return;
        }
        await channel.send({ content: content.trim() });
      }

      addActivity({
        guildId: channel.guild.id,
        type: "announcement",
        title: isEmbed ? "Zengin Duyuru Gönderildi" : "Mesaj Gönderildi",
        desc: `#${channel.name} kanalına iletildi`,
        icon: isEmbed ? "newspaper" : "paper-plane",
        color: "#38bdf8",
      });

      res.json({ ok: true, channelName: channel.name });
    } catch (error) {
      console.error("Mesaj gönderme hatası:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Mesaj gönderilirken hata oluştu." });
    }
  });

  // Canlı Panel Günlüğü (Web Log Explorer)
  app.get("/api/logs", (req, res) => {
    const guildId = String(req.query.guildId || "");
    const search = String(req.query.search || "");
    const category = String(req.query.category || "");
    const eventType = String(req.query.eventType || "");
    const limit = parseInt(String(req.query.limit || "50"), 10) || 50;

    const logs = queryLogs({
      guildId: guildId || undefined,
      search: search || undefined,
      category: category || undefined,
      eventType: eventType || undefined,
      limit,
    });

    res.json({ logs });
  });

  // Logları Temizle
  app.post("/api/logs/clear", (req, res) => {
    const guildId = String(req.query.guildId || req.body?.guildId || "");
    clearLogs(guildId || undefined);
    res.json({ ok: true });
  });

  // Test Logu Gönder (Doğrulama ve test amaçlı)
  app.post("/api/logs/test", async (req, res) => {
    try {
      const guildId = String(req.query.guildId || req.body?.guildId || "");
      if (!guildId) {
        res.status(400).json({ error: "Lütfen bir sunucu seçin." });
        return;
      }
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        res.status(404).json({ error: "Sunucu bulunamadı." });
        return;
      }

      const testEmbed = new EmbedBuilder()
        .setColor(0xffe000)
        .setTitle("🧪 Test Denetim Kaydı (Audit Log)")
        .setDescription("Bu mesaj, bot yönetim panelinden tetiklenen bir test kaydıdır. Tüm filtre ve yönlendirmeler başarıyla çalışmaktadır!")
        .addFields(
          { name: "Kullanıcı", value: `${client.user?.tag || "Bot"} (\`${client.user?.id}\`)`, inline: true },
          { name: "Durum", value: "✅ Bağlantı Aktif", inline: true }
        )
        .setTimestamp();

      await sendLog(guild, testEmbed, {
        category: "messages",
        eventType: "messageDelete",
        user: {
          id: client.user?.id || "admin",
          tag: `${client.user?.username || "Yönetici"} (Panel)`,
          avatarUrl: client.user?.displayAvatarURL() || undefined,
          isBot: false,
        },
        record: {
          title: "Test Denetim Kaydı Gönderildi",
          description: "Yönetim paneli üzerinden test log kaydı tetiklendi.",
          details: { tetikleyen: "Yönetici Paneli", durum: "Başarılı" },
          color: "#FFE000",
        },
      });

      res.json({ ok: true });
    } catch (error) {
      console.error("Test log gönderme hatası:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Test log gönderilemedi." });
    }
  });

  // Ana Sayfa Gönderi Akışı Test Kartı Gönder
  app.post("/api/feed/test", async (req, res) => {
    try {
      const guildId = String(req.query.guildId || req.body?.guildId || "");
      if (!guildId) {
        res.status(400).json({ error: "Lütfen bir sunucu seçin." });
        return;
      }
      const { feed } = getGuildSettings(guildId);
      if (!feed.targetChannelId) {
        res.status(400).json({ error: "Lütfen önce bir hedef akış kanalı seçip kaydedin." });
        return;
      }

      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        res.status(404).json({ error: "Sunucu bulunamadı." });
        return;
      }

      const channel = await client.channels.fetch(feed.targetChannelId).catch(() => null);
      if (!channel || channel.isDMBased() || !channel.isTextBased()) {
        res.status(404).json({ error: "Hedef akış kanalı bulunamadı veya bota mesaj izni yok." });
        return;
      }

      let embedColor = 0xffe000;
      if (feed.embedColor && feed.embedColor.startsWith("#")) {
        const parsed = parseInt(feed.embedColor.replace("#", ""), 16);
        if (!isNaN(parsed)) embedColor = parsed;
      }

      const firstSourceId = feed.sourceChannelIds?.[0];
      const sourceChannel = firstSourceId ? guild.channels.cache.get(firstSourceId) : null;
      const isForum = sourceChannel ? (sourceChannel.type === ChannelType.GuildForum || sourceChannel.type === ChannelType.GuildMedia) : false;
      const channelLabel = sourceChannel ? (isForum ? `💬 ${sourceChannel.name} (Forum)` : `📌 #${sourceChannel.name}`) : "📌 #kaynak-kanalı";

      const testEmbed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(channelLabel)
        .setDescription(
          "Bu bir test gönderi akışı önizlemesidir! Seçtiğiniz kaynak kanallarda yeni mesajlar ve forum gönderileri paylaşıldığında, içerik özetleri ve doğrudan gönderi bağlantısı bu formatta otomatik paylaşılacaktır."
        )
        .addFields(
          { name: "Yazar", value: `<@${client.user?.id}>`, inline: true },
          { name: "Paylaşım", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        );

      if (feed.includeImages !== false) {
        testEmbed.setImage("https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80");
      }

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("Gönderiye Git")
          .setURL(`https://discord.com/channels/${guild.id}/${channel.id}`)
      );

      await channel.send({
        embeds: [testEmbed],
        components: [row],
      });

      addActivity({
        guildId: guild.id,
        type: "feed",
        title: "Test Gönderi Akışı",
        desc: `#${channel.name} kanalına test kartı basıldı`,
        icon: "newspaper",
        color: "#FFE000",
      });

      res.json({ ok: true, channelName: channel.name });
    } catch (error) {
      console.error("Test akış kartı hatası:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Test akış kartı gönderilemedi." });
    }
  });

  // Sunucu Üyeleri & Filtreleme Verileri API'si
  app.get("/api/members", async (req, res) => {
    try {
      const guildId = String(req.query.guildId || "");
      if (!guildId) {
        res.status(400).json({ error: "Lütfen bir sunucu belirtin (guildId eksik)." });
        return;
      }
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        res.status(404).json({ error: "Sunucu bulunamadı." });
        return;
      }

      // Üyeleri Discord'dan eksiksiz çek (eşzamanlı istekler birleştirilir, sık tekrar engellenir)
      await ensureMembersCached(guild, req.query.forceRefresh === "true");

      // Sunucu rolleri (En yüksek rolden en düşüğe, @everyone hariç)
      const roles = guild.roles.cache
        .filter((r) => r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map((r) => ({
          id: r.id,
          name: r.name,
          color: r.hexColor === "#000000" ? "#9ca3af" : r.hexColor,
          position: r.position,
          memberCount: r.members.size,
          isHoisted: r.hoist,
        }));

      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

      let humans = 0;
      let bots = 0;
      let boosters = 0;
      let timedOut = 0;
      let inVoice = 0;
      let admins = 0;
      let recent24h = 0;
      let recent7d = 0;
      let newAccounts = 0;
      let noRoles = 0;
      let pendingCount = 0;

      const me = guild.members.me;
      const botCanModerate = Boolean(me?.permissions.has(PermissionFlagsBits.ModerateMembers));
      const botCanKick = Boolean(me?.permissions.has(PermissionFlagsBits.KickMembers));
      const botCanManageNick = Boolean(me?.permissions.has(PermissionFlagsBits.ManageNicknames));

      const membersList = [];

      for (const m of guild.members.cache.values()) {
        const isBot = m.user.bot;
        if (isBot) bots++; else humans++;

        const isBoosting = Boolean(m.premiumSince);
        if (isBoosting) boosters++;

        const isTimedOut = m.isCommunicationDisabled();
        if (isTimedOut) timedOut++;

        const inVoiceState = Boolean(m.voice?.channelId);
        if (inVoiceState) inVoice++;

        const isAdmin = m.permissions.has(PermissionFlagsBits.Administrator);
        if (isAdmin) admins++;

        if (m.joinedTimestamp && m.joinedTimestamp >= oneDayAgo) recent24h++;
        if (m.joinedTimestamp && m.joinedTimestamp >= sevenDaysAgo) recent7d++;
        if (m.user.createdTimestamp >= thirtyDaysAgo) newAccounts++;
        if (m.pending) pendingCount++;

        const memberRoles = m.roles.cache
          .filter((r) => r.id !== guild.id)
          .sort((a, b) => b.position - a.position)
          .map((r) => ({
            id: r.id,
            name: r.name,
            color: r.hexColor === "#000000" ? "#9ca3af" : r.hexColor,
            position: r.position,
          }));

        if (memberRoles.length === 0) noRoles++;

        const highestRole = m.roles.highest && m.roles.highest.id !== guild.id
          ? {
              id: m.roles.highest.id,
              name: m.roles.highest.name,
              color: m.roles.highest.hexColor === "#000000" ? "#9ca3af" : m.roles.highest.hexColor,
              position: m.roles.highest.position,
            }
          : null;

        // Önemli yetkiler listesi
        const keyPermissions: string[] = [];
        if (isAdmin) keyPermissions.push("Yönetici (Admin)");
        if (m.permissions.has(PermissionFlagsBits.ManageGuild)) keyPermissions.push("Sunucuyu Yönet");
        if (m.permissions.has(PermissionFlagsBits.ManageRoles)) keyPermissions.push("Rolleri Yönet");
        if (m.permissions.has(PermissionFlagsBits.ManageChannels)) keyPermissions.push("Kanalları Yönet");
        if (m.permissions.has(PermissionFlagsBits.KickMembers)) keyPermissions.push("Üyeleri At");
        if (m.permissions.has(PermissionFlagsBits.BanMembers)) keyPermissions.push("Üyeleri Yasakla");
        if (m.permissions.has(PermissionFlagsBits.ModerateMembers)) keyPermissions.push("Zamanaşımı Uygula");
        if (m.permissions.has(PermissionFlagsBits.ManageMessages)) keyPermissions.push("Mesajları Yönet");
        if (m.permissions.has(PermissionFlagsBits.MentionEveryone)) keyPermissions.push("@everyone Etiketle");
        if (m.permissions.has(PermissionFlagsBits.ViewAuditLog)) keyPermissions.push("Denetim Kaydını Gör");

        membersList.push({
          id: m.id,
          username: m.user.username,
          discriminator: m.user.discriminator,
          tag: m.user.tag,
          displayName: m.displayName,
          nickname: m.nickname,
          avatarUrl: m.displayAvatarURL({ extension: "png", size: 128 }),
          bannerUrl: m.user.bannerURL({ extension: "png", size: 512 }) || null,
          isBot,
          joinedAt: m.joinedAt ? m.joinedAt.toISOString() : null,
          joinedTimestamp: m.joinedTimestamp,
          createdAt: m.user.createdAt.toISOString(),
          createdTimestamp: m.user.createdTimestamp,
          isBoosting,
          premiumSince: m.premiumSince ? m.premiumSince.toISOString() : null,
          isTimedOut,
          communicationDisabledUntil: m.communicationDisabledUntil ? m.communicationDisabledUntil.toISOString() : null,
          communicationDisabledUntilTimestamp: m.communicationDisabledUntilTimestamp,
          inVoice: inVoiceState,
          voiceChannelName: m.voice?.channel ? m.voice.channel.name : null,
          voiceChannelId: m.voice?.channelId || null,
          isAdmin,
          isMod: isAdmin || m.permissions.has(PermissionFlagsBits.ManageGuild) || m.permissions.has(PermissionFlagsBits.KickMembers) || m.permissions.has(PermissionFlagsBits.BanMembers),
          pending: Boolean(m.pending),
          roles: memberRoles,
          highestRole,
          permissions: keyPermissions,
          canModerate: Boolean(botCanModerate && m.moderatable),
          canKick: Boolean(botCanKick && m.kickable),
          canManageNick: Boolean(botCanManageNick && m.manageable),
        });
      }

      res.json({
        guild: {
          id: guild.id,
          name: guild.name,
          icon: guild.iconURL({ extension: "png", size: 128 }),
          memberCount: guild.memberCount,
          ownerId: guild.ownerId,
        },
        roles,
        stats: {
          total: membersList.length,
          humans,
          bots,
          boosters,
          timedOut,
          inVoice,
          admins,
          recent24h,
          recent7d,
          newAccounts,
          noRoles,
          pending: pendingCount,
        },
        members: membersList,
      });
    } catch (error) {
      console.error("Members API error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Üye listesi alınamadı." });
    }
  });

  // Üye Yönetim & Moderasyon Eylemi
  app.post("/api/members/action", async (req, res) => {
    try {
      const { guildId, memberId, action, durationMinutes, nickname, reason } = req.body || {};
      if (!guildId || !memberId || !action) {
        res.status(400).json({ error: "Eksik parametreler (guildId, memberId, action gereklidir)." });
        return;
      }
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        res.status(404).json({ error: "Sunucu bulunamadı." });
        return;
      }
      const member = await guild.members.fetch(memberId).catch(() => null);
      if (!member) {
        res.status(404).json({ error: "Üye bulunamadı." });
        return;
      }

      if (action === "timeout") {
        const minutes = Number(durationMinutes) || 0;
        if (minutes <= 0) {
          await member.timeout(null, reason || "Yönetim paneli tarafından zamanaşımı kaldırıldı");
          addActivity({
            guildId: guild.id,
            type: "bot",
            title: "Zamanaşımı Kaldırıldı",
            desc: `${member.user.tag} üyesinin zamanaşımı kaldırıldı`,
            icon: "hourglass",
            color: "#22c55e",
          });
          res.json({ ok: true, message: `${member.user.tag} için zamanaşımı kaldırıldı.` });
          return;
        }
        const ms = minutes * 60 * 1000;
        await member.timeout(ms, reason || `Yönetim panelinden ${minutes} dakika ceza uygulandı`);
        addActivity({
          guildId: guild.id,
          type: "bot",
          title: "Zamanaşımı Uygulandı",
          desc: `${member.user.tag} üyesine ${minutes} dk zamanaşımı verildi`,
          icon: "hourglass-half",
          color: "#f87171",
        });
        res.json({ ok: true, message: `${member.user.tag} üyesine ${minutes} dakika zamanaşımı uygulandı.` });
        return;
      }

      if (action === "kick") {
        if (!member.kickable) {
          res.status(403).json({ error: "Bu üyeyi atma yetkiniz yok (Rolü botunkinden yüksek veya sunucu sahibi)." });
          return;
        }
        await member.kick(reason || "Yönetim panelinden atıldı");
        addActivity({
          guildId: guild.id,
          type: "member_leave",
          title: "Üye Sunucudan Atıldı",
          desc: `${member.user.tag} yönetim panelinden atıldı`,
          icon: "user-xmark",
          color: "#ef4444",
        });
        res.json({ ok: true, message: `${member.user.tag} sunucudan atıldı.` });
        return;
      }

      if (action === "setNickname") {
        if (!member.manageable) {
          res.status(403).json({ error: "Bu üyenin takma adını değiştirme yetkisi yok." });
          return;
        }
        const newNick = nickname ? String(nickname).trim().slice(0, 32) : null;
        await member.setNickname(newNick, reason || "Yönetim paneli");
        res.json({ ok: true, message: `Takma ad ${newNick ? `"${newNick}" olarak ayarlandı.` : "sıfırlandı."}` });
        return;
      }

      res.status(400).json({ error: "Geçersiz işlem." });
    } catch (error) {
      console.error("Üye işlemi hatası:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "İşlem gerçekleştirilemedi." });
    }
  });

  const { port, host } = config.dashboard;
  app.listen(port, host, () => {
    console.log(`🌐 Yönetim paneli: http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
  });
}
