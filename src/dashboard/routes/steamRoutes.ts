import { Router } from "express";
import type { Client } from "discord.js";
import {
  fetchLatestSteamNews,
  fetchSteamAppDetails,
  formatSteamAnnouncement,
} from "../../services/steamService.js";
import { checkGuildSteamUpdates } from "../../services/steamWatcher.js";

export function createSteamRoutes(client: Client): Router {
  const router = Router();

  router.get("/api/steam/info", async (req, res) => {
    try {
      const appId = String(req.query.appId || "").trim();
      if (!appId || !/^\d+$/.test(appId)) {
        res.status(400).json({ error: "Lütfen geçerli bir sayısal Steam App ID girin." });
        return;
      }

      const appDetails = await fetchSteamAppDetails(appId);
      const newsItems = await fetchLatestSteamNews(appId, 1);
      const latestAnnouncement =
        newsItems.length > 0 ? formatSteamAnnouncement(newsItems[0], appDetails.name) : null;

      res.json({
        appDetails,
        latestAnnouncement,
      });
    } catch (error) {
      console.error("Steam bilgi sorgulama hatası:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Steam bilgileri alınamadı.",
      });
    }
  });

  router.post("/api/steam/test", async (req, res) => {
    try {
      const guildId = String(req.query.guildId || req.body?.guildId || "");
      if (!guildId) {
        res.status(400).json({ error: "Lütfen bir sunucu belirtin." });
        return;
      }

      const result = await checkGuildSteamUpdates(client, guildId, true);
      if (!result.success) {
        res.status(400).json({ error: result.message });
        return;
      }

      res.json({ ok: true, message: result.message });
    } catch (error) {
      console.error("Steam test duyuru hatası:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Test duyurusu gönderilemedi.",
      });
    }
  });

  return router;
}
