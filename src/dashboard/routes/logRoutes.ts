import { Router } from "express";
import { EmbedBuilder, type Client } from "discord.js";
import { logRepository } from "../../repositories/logRepository.js";
import { auditLoggerService } from "../../services/logging/AuditLoggerService.js";

export function createLogRoutes(client: Client): Router {
  const router = Router();

  router.get("/api/logs", (req, res) => {
    const guildId = String(req.query.guildId || "");
    const search = String(req.query.search || "");
    const category = String(req.query.category || "");
    const eventType = String(req.query.eventType || "");
    const limit = parseInt(String(req.query.limit || "50"), 10) || 50;

    const logs = logRepository.query({
      guildId: guildId || undefined,
      search: search || undefined,
      category: category || undefined,
      eventType: eventType || undefined,
      limit,
    });

    res.json({ logs });
  });

  router.post("/api/logs/clear", (req, res) => {
    const guildId = String(req.query.guildId || req.body?.guildId || "");
    logRepository.clear(guildId || undefined);
    res.json({ ok: true });
  });

  router.post("/api/logs/test", async (req, res) => {
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
        .setDescription(
          "Bu mesaj, bot yönetim panelinden tetiklenen bir test kaydıdır. Tüm filtre ve yönlendirmeler başarıyla çalışmaktadır!"
        )
        .addFields(
          {
            name: "Kullanıcı",
            value: `${client.user?.tag || "Bot"} (\`${client.user?.id}\`)`,
            inline: true,
          },
          { name: "Durum", value: "✅ Bağlantı Aktif", inline: true }
        )
        .setTimestamp();

      await auditLoggerService.sendLog(guild, testEmbed, {
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
      res.status(500).json({
        error: error instanceof Error ? error.message : "Test log gönderilemedi.",
      });
    }
  });

  return router;
}
