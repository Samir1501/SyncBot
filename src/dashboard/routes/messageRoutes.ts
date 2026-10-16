import { Router } from "express";
import type { Client } from "discord.js";
import { activityRepository } from "../../repositories/activityRepository.js";
import { feedService } from "../../services/feed/FeedService.js";

export function createMessageRoutes(client: Client): Router {
  const router = Router();

  router.post("/api/messages/send", async (req, res) => {
    try {
      const { channelId, content, isEmbed, embedTitle, embedColor, embedDescription } =
        req.body || {};

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
          res
            .status(400)
            .json({ error: "Duyuru için en az bir başlık veya açıklama girmelisiniz." });
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

      activityRepository.add({
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
      res.status(500).json({
        error: error instanceof Error ? error.message : "Mesaj gönderilirken hata oluştu.",
      });
    }
  });

  router.post("/api/feed/test", async (req, res) => {
    try {
      const guildId = String(req.query.guildId || req.body?.guildId || "");
      if (!guildId) {
        res.status(400).json({ error: "Lütfen bir sunucu seçin." });
        return;
      }

      const { channelName } = await feedService.sendTestCard(client, guildId);
      res.json({ ok: true, channelName });
    } catch (error) {
      console.error("Test akış kartı hatası:", error);
      const message = error instanceof Error ? error.message : "Test akış kartı gönderilemedi.";
      const status =
        message.includes("seçip kaydedin")
          ? 400
          : message.includes("bulunamadı")
            ? 404
            : 500;
      res.status(status).json({ error: message });
    }
  });

  return router;
}
