import type { Request, Response, NextFunction } from "express";
import { config } from "../../config.js";
import { getSessionByCookie, type UserSession } from "../routes/authRoutes.js";

// Express Request tipini genişleterek oturum bilgisini ekleyelim
declare global {
  namespace Express {
    interface Request {
      userSession?: UserSession;
    }
  }
}

/**
 * 1. Oturum Zorunluluğu:
 * Eğer DASHBOARD_PASSWORD tanımlıysa ve basicAuth geçmişse tam yönetici kabul edilir.
 * Aksi halde kullanıcının Discord ile giriş yapmış geçerli bir oturumu (`syncbot_session`) olmalıdır.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Eğer sunucu sahibi .env içinde DASHBOARD_PASSWORD tanımladıysa ve basic auth ile bağlandıysa bypass et
  if (config.dashboard.password && req.headers.authorization) {
    return next();
  }

  // Discord OAuth2 Session kontrolü
  const session = getSessionByCookie(req);
  if (!session) {
    res.status(401).json({
      error: "Bu işlemi gerçekleştirmek için Discord ile giriş yapmalısınız.",
      code: "UNAUTHORIZED",
    });
    return;
  }

  req.userSession = session;
  next();
}

/**
 * 2. Sunucu Yönetici Yetkisi Doğrulaması (Cross-Tenant Koruması):
 * İstekteki `guildId` (query veya body) parametresine bakar.
 * Giriş yapan kullanıcının bu sunucuda Kurucu (Owner), Yönetici (Admin: 0x8) veya
 * Sunucuyu Yönet (ManageGuild: 0x20) yetkisine sahip olup olmadığını doğrular.
 */
export function requireGuildPermission(req: Request, res: Response, next: NextFunction): void {
  // Master şifre ile girilmişse izin ver
  if (config.dashboard.password && req.headers.authorization) {
    return next();
  }

  const session = req.userSession || getSessionByCookie(req);
  if (!session) {
    res.status(401).json({
      error: "Oturum açmanız gerekiyor.",
      code: "UNAUTHORIZED",
    });
    return;
  }
  req.userSession = session;

  const targetGuildId = String(req.query.guildId || req.body?.guildId || "");
  if (!targetGuildId) {
    // Bazı isteklerde guildId zorunlu olmayabilir, genel kontrollerde devam et
    return next();
  }

  // Kullanıcının yetkili olduğu sunucular listesinde targetGuildId var mı kontrol et
  const userGuild = session.rawGuilds?.find((g: any) => String(g.id) === targetGuildId);
  if (!userGuild) {
    res.status(403).json({
      error: "Bu sunucunun verilerini görüntüleme veya yönetme yetkiniz bulunmuyor.",
      code: "FORBIDDEN",
    });
    return;
  }

  const isOwner = Boolean(userGuild.owner);
  const permBig = BigInt(userGuild.permissions || "0");
  const isAdmin = (permBig & 0x8n) !== 0n;
  const isManager = (permBig & 0x20n) !== 0n;

  if (!isOwner && !isAdmin && !isManager) {
    res.status(403).json({
      error: "Bu sunucuda 'Yönetici' veya 'Sunucuyu Yönet' yetkisine sahip değilsiniz.",
      code: "INSUFFICIENT_PERMISSIONS",
    });
    return;
  }

  next();
}
