import { Router } from "express";
import type { Client } from "discord.js";
import { memberQueryService } from "../services/memberQueryService.js";
import { memberModerationService } from "../services/moderationStrategies.js";

export function createMemberRoutes(client: Client): Router {
  const router = Router();

  router.get("/api/members", async (req, res) => {
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

      const data = await memberQueryService.getGuildMembersData(
        guild,
        req.query.forceRefresh === "true"
      );
      res.json(data);
    } catch (error) {
      console.error("Members API error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Üye listesi alınamadı.",
      });
    }
  });

  router.post("/api/members/action", async (req, res) => {
    try {
      const { guildId, memberId, action, durationMinutes, nickname, reason } = req.body || {};
      if (!guildId || !memberId || !action) {
        res
          .status(400)
          .json({ error: "Eksik parametreler (guildId, memberId, action gereklidir)." });
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

      const result = await memberModerationService.executeAction(guild, member, {
        action: String(action),
        durationMinutes: durationMinutes !== undefined ? Number(durationMinutes) : undefined,
        nickname,
        reason,
      });

      res.status(result.status).json(result.body);
    } catch (error) {
      console.error("Üye işlemi hatası:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "İşlem gerçekleştirilemedi.",
      });
    }
  });

  return router;
}
