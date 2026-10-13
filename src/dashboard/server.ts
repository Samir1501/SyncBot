import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, type Client } from "discord.js";
import { config } from "../config.js";
import { getGuildSettings, saveGuildSettings, sanitizeGuildSettings, UPLOADS_DIR } from "../settings.js";
import { renderWelcomeCard, type CardData } from "../welcome/cardRenderer.js";
import { sendWelcome } from "../welcome/sendWelcome.js";
import { addActivity, getActivities } from "../utils/activityTracker.js";
import { queryLogs, clearLogs } from "../utils/logStore.js";
import { sendLog } from "../utils/logger.js";

const PUBLIC_DIR = path.join(process.cwd(), "public");

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
    if (guild && guild.members.cache.size < guild.memberCount) {
      await guild.members.fetch().catch(() => null);
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
        djsVersion: "14.17.3",
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

      const testEmbed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle("Örnek Gönderi Başlığı")
        .setDescription(
          "Bu bir test gönderi akışı önizlemesidir! Seçtiğiniz kaynak kanallarda yeni mesajlar paylaşıldığında, içerik özetleri ve doğrudan gönderi bağlantısı bu formatta otomatik paylaşılacaktır."
        )
        .addFields(
          { name: "Yazar", value: `<@${client.user?.id}>`, inline: true },
          { name: "Paylaşım", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        );

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

  const { port, host } = config.dashboard;
  app.listen(port, host, () => {
    console.log(`🌐 Yönetim paneli: http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
  });
}
