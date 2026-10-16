import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { UPLOADS_DIR } from "../../settings/defaults.js";
import { settingsRepository } from "../../settings/repository.js";

export function createSettingsRoutes(): Router {
  const router = Router();

  router.get("/api/settings", (req, res) => {
    const guildId = String(req.query.guildId || "");
    res.json(settingsRepository.getGuildSettings(guildId || null));
  });

  router.put("/api/settings", (req, res) => {
    const guildId = String(req.query.guildId || req.body?.guildId || "");
    if (!guildId) {
      res.status(400).json({ error: "Lütfen bir sunucu belirtin (guildId eksik)." });
      return;
    }
    res.json(settingsRepository.saveGuildSettings(guildId, req.body));
  });

  router.post("/api/upload", (req, res) => {
    const match = /^data:image\/(png|jpeg|webp|gif);base64,(.+)$/.exec(
      String(req.body?.dataUrl ?? "")
    );
    if (!match) {
      res.status(400).json({ error: "Geçersiz görsel. PNG, JPG, WEBP veya GIF yükleyin." });
      return;
    }
    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    const fileName = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, fileName), Buffer.from(match[2], "base64"));
    res.json({ url: `/uploads/${fileName}` });
  });

  return router;
}
