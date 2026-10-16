import { Router } from "express";
import { ChannelType, type Client } from "discord.js";
import { statsService } from "../services/statsService.js";

export function createGuildRoutes(client: Client): Router {
  const router = Router();

  router.get("/api/guilds", (_req, res) => {
    const guilds = client.guilds.cache.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.iconURL({ extension: "png", size: 128 }),
      memberCount: g.memberCount,
    }));
    res.json(guilds);
  });

  router.get("/api/bot", (req, res) => {
    const guildId = String(req.query.guildId || "");
    res.json({ ready: client.isReady(), ...statsService.getSampleCardData(client, guildId) });
  });

  router.get("/api/stats", async (req, res) => {
    const guildId = String(req.query.guildId || "");
    const stats = await statsService.getDashboardStats(client, guildId);
    res.json(stats);
  });

  router.get("/api/channels", async (req, res) => {
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

  router.get("/api/roles", async (req, res) => {
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
