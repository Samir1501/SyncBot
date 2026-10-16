import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../../config.js";

/**
 * Single Responsibility (SRP): Yönetim paneli HTTP Basic Authentication doğrulama katmanı.
 */
export function basicAuth(req: Request, res: Response, next: NextFunction): void {
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
