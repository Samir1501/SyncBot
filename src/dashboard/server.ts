import fs from "node:fs";
import path from "node:path";
import express, { type Express } from "express";
import type { Client } from "discord.js";
import { config } from "../config.js";
import { UPLOADS_DIR } from "../settings/defaults.js";
import { basicAuth } from "./middleware/basicAuth.js";
import { createGuildRoutes } from "./routes/guildRoutes.js";
import { createLogRoutes } from "./routes/logRoutes.js";
import { createMemberRoutes } from "./routes/memberRoutes.js";
import { createMessageRoutes } from "./routes/messageRoutes.js";
import { createSettingsRoutes } from "./routes/settingsRoutes.js";
import { createSteamRoutes } from "./routes/steamRoutes.js";
import { createWelcomeRoutes } from "./routes/welcomeRoutes.js";

const PUBLIC_DIR = path.join(process.cwd(), "public");

/**
 * Express uygulamasını oluşturur ve tüm modüler rotaları bağlar (Single Responsibility & Open/Closed).
 */
export function createDashboardApp(client: Client): Express {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const app = express();
  app.use(basicAuth);
  app.use(express.json({ limit: "10mb" }));
  app.use(express.static(PUBLIC_DIR));
  app.use("/uploads", express.static(UPLOADS_DIR));

  // Modüler API Rotaları
  app.use(createGuildRoutes(client));
  app.use(createSettingsRoutes());
  app.use(createWelcomeRoutes(client));
  app.use(createMessageRoutes(client));
  app.use(createLogRoutes(client));
  app.use(createSteamRoutes(client));
  app.use(createMemberRoutes(client));

  return app;
}

export function startDashboard(client: Client): void {
  const app = createDashboardApp(client);
  const { port, host } = config.dashboard;

  app.listen(port, host, () => {
    console.log(`🌐 Yönetim paneli: http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
  });
}
