import { Router } from "express";
import type { Client } from "discord.js";
import { activityRepository } from "../../repositories/activityRepository.js";
import { settingsRepository } from "../../settings/repository.js";
import { sanitizeGuildSettings } from "../../settings/sanitizer.js";
import { renderWelcomeCard } from "../../welcome/cardRenderer.js";
import { sendWelcome } from "../../welcome/sendWelcome.js";
import { statsService } from "../services/statsService.js";

export function createWelcomeRoutes(client: Client): Router {
  const router = Router();

  router.post("/api/preview", async (req, res) => {
    try {
      const guildId = String(req.query.guildId || req.body?.guildId || "");
      const card = sanitizeGuildSettings({ welcome: { card: req.body?.card } }).welcome.card;
      const png = await renderWelcomeCard(card, statsService.getSampleCardData(client, guildId));
      res.type("png").send(png);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.post("/api/welcome/test", async (req, res) => {
    const guildId = String(req.query.guildId || req.body?.guildId || "");
    const { welcome } = settingsRepository.getGuildSettings(guildId);
    try {
      if (!welcome.channelId) throw new Error("Önce bir karşılama kanalı seçip kaydedin.");
      const channel = await client.channels.fetch(welcome.channelId).catch(() => null);
      if (!channel || channel.isDMBased() || !channel.isTextBased()) {
        throw new Error("Karşılama kanalı bulunamadı.");
      }
      const member = await channel.guild.members.fetchMe();
      await sendWelcome(member, channel);
      activityRepository.add({
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

  return router;
}
