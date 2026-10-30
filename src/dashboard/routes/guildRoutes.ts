import { Router } from "express";
import { ChannelType, type Client } from "discord.js";
import { statsService } from "../services/statsService.js";
import { activityTrackerService } from "../../services/activity/ActivityTrackerService.js";
import { requireAuth, requireGuildPermission } from "../middleware/authMiddleware.js";

export function createGuildRoutes(client: Client): Router {
  const router = Router();

  // 1. Genel & Herkese Açık Uç Noktalar (Landing sayfası ve bot önizleme)
  router.get("/api/invite", (_req, res) => {
    const clientId = client.user?.id || "";
    const inviteUrl = clientId
      ? `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`
      : "";

    res.json({
      clientId,
      botName: client.user?.username || "SyncBot",
      botAvatar: client.user?.displayAvatarURL({ extension: "png", size: 128 }) || "",
      inviteUrl,
      permissions: "Administrator (Önerilen)",
    });
  });

  router.get("/api/bot", (req, res) => {
    const guildId = String(req.query.guildId || "");
    const clientId = client.user?.id || "";
    const inviteUrl = clientId
      ? `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`
      : "";

    res.json({
      ready: client.isReady(),
      clientId,
      inviteUrl,
      ...statsService.getSampleCardData(client, guildId),
    });
  });

  // 2. Giriş ve Yetki Gerektiren Uç Noktalar
  // Kullanıcının yalnızca yetkili olduğu sunucuların listesini döner
  router.get("/api/guilds", requireAuth, (req, res) => {
    const session = req.userSession;
    const manageableGuildIds = new Set(
      session?.rawGuilds
        ?.filter((g: any) => {
          const isOwner = Boolean(g.owner);
          const permBig = BigInt(g.permissions || "0");
          return isOwner || (permBig & 0x8n) !== 0n || (permBig & 0x20n) !== 0n;
        })
        .map((g: any) => String(g.id)) || []
    );

    const guilds = client.guilds.cache
      .filter((g) => !session || manageableGuildIds.has(g.id))
      .map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.iconURL({ extension: "png", size: 128 }),
        memberCount: g.memberCount,
      }));
    res.json(guilds);
  });

  router.get("/api/stats", requireAuth, requireGuildPermission, async (req, res) => {
    const guildId = String(req.query.guildId || "");
    const stats = await statsService.getDashboardStats(client, guildId);
    res.json(stats);
  });

  router.get("/api/stats/activity", requireAuth, requireGuildPermission, async (req, res) => {
    try {
      const guildId = String(req.query.guildId || "");
      if (!guildId) {
        res.status(400).json({ error: "Lütfen bir sunucu belirtin (guildId eksik)." });
        return;
      }
      const rawPeriod = String(req.query.period || "7d");
      const period = rawPeriod === "24h" || rawPeriod === "30d" ? rawPeriod : "7d";
      const analytics = await activityTrackerService.getActivityAnalytics(client, guildId, period);
      res.json(analytics);
    } catch (err: any) {
      console.error("Aktivite analitiği hatası:", err);
      res.status(500).json({ error: "Aktivite verileri alınamadı: " + err.message });
    }
  });

  router.get("/api/channels", requireAuth, requireGuildPermission, async (req, res) => {
    const filterGuildId = String(req.query.guildId || "");
    const channels: {
      id: string;
      name: string;
      guildId: string;
      guild: string;
      position: number;
      isForum?: boolean;
    }[] = [];

    for (const guild of client.guilds.cache.values()) {
      if (filterGuildId && guild.id !== filterGuildId) continue;
      const guildChannels =
        guild.channels.cache.size > 0
          ? guild.channels.cache
          : await guild.channels.fetch().catch(() => guild.channels.cache);

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

  router.get("/api/roles", requireAuth, requireGuildPermission, async (req, res) => {
    try {
      const guildId = String(req.query.guildId || "");
      if (!guildId) {
        res.status(400).json({ error: "Lütfen bir sunucu belirtin (guildId eksik)." });
        return;
      }
      const guild =
        client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
      if (!guild) {
        res.status(404).json({ error: "Sunucu bulunamadı." });
        return;
      }

      const roles = guild.roles.cache
        .filter((r) => r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map((r) => ({
          id: r.id,
          name: r.name,
          color: r.hexColor === "#000000" ? "#9ca3af" : r.hexColor,
          position: r.position,
          memberCount: r.members.size,
        }));

      res.json(roles);
    } catch (error) {
      console.error("Rol listesi hatası:", error);
      res.status(500).json({ error: "Rol listesi alınamadı." });
    }
  });

  return router;
}
