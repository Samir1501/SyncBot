import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { type Client } from "discord.js";
import { config } from "../../config.js";

export interface DiscordAuthUser {
  id: string;
  username: string;
  tag: string;
  avatarUrl: string;
}

export interface ManageableGuildItem {
  id: string;
  name: string;
  icon: string | null;
  iconUrl: string;
  isOwner: boolean;
  hasBot: boolean;
  memberCount: number | null;
  inviteUrl: string;
}

interface UserSession {
  user: DiscordAuthUser;
  rawGuilds: any[];
  expiresAt: number;
}

const sessionStore = new Map<string, UserSession>();

function parseCookies(req: Request): Record<string, string> {
  const list: Record<string, string> = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawVal] = part.split("=");
    const name = rawName?.trim();
    if (!name) continue;
    list[name] = decodeURIComponent(rawVal.join("=").trim());
  }
  return list;
}

export function createAuthRoutes(client: Client): Router {
  const router = Router();

  const getClientId = () => config.oauth.clientId || client.user?.id || "";
  const getRedirectUri = (req: Request) => {
    if (config.oauth.redirectUri) return config.oauth.redirectUri;
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.get("host") || `127.0.0.1:${config.dashboard.port}`;
    return `${protocol}://${host}/api/auth/discord/callback`;
  };

  /**
   * Discord OAuth2 Giriş Başlatıcı
   */
  router.get("/api/auth/discord", (req: Request, res: Response) => {
    const clientId = getClientId();
    const clientSecret = config.oauth.clientSecret;
    const redirectUri = getRedirectUri(req);

    // Client Secret girilmemişse kullanıcıya yardımcı kurulum sayfası dön
    if (!clientSecret) {
      res.redirect("/?oauth_setup_needed=1");
      return;
    }

    const state = crypto.randomBytes(16).toString("hex");
    res.setHeader(
      "Set-Cookie",
      `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300`
    );

    const discordAuthUrl = new URL("https://discord.com/oauth2/authorize");
    discordAuthUrl.searchParams.set("client_id", clientId);
    discordAuthUrl.searchParams.set("redirect_uri", redirectUri);
    discordAuthUrl.searchParams.set("response_type", "code");
    discordAuthUrl.searchParams.set("scope", "identify guilds");
    discordAuthUrl.searchParams.set("state", state);
    discordAuthUrl.searchParams.set("prompt", "consent");

    res.redirect(discordAuthUrl.toString());
  });

  /**
   * Discord OAuth2 Callback (Geri Dönüş Noktası)
   */
  router.get("/api/auth/discord/callback", async (req: Request, res: Response) => {
    const { code, state, error } = req.query;

    if (error) {
      console.warn("[OAuth2] Giriş iptal edildi veya hata:", error);
      res.redirect("/?auth_error=" + encodeURIComponent(String(error)));
      return;
    }

    if (!code || typeof code !== "string") {
      res.redirect("/?auth_error=no_code");
      return;
    }

    const cookies = parseCookies(req);
    const expectedState = cookies["oauth_state"];
    if (expectedState && state && state !== expectedState) {
      res.redirect("/?auth_error=invalid_state");
      return;
    }

    const clientId = getClientId();
    const clientSecret = config.oauth.clientSecret;
    const redirectUri = getRedirectUri(req);

    try {
      // 1. Token Exchange
      const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text();
        console.error("[OAuth2] Token alınamadı:", tokenRes.status, errBody);
        res.redirect("/?auth_error=token_exchange_failed");
        return;
      }

      const tokenData = (await tokenRes.json()) as { access_token: string };
      const accessToken = tokenData.access_token;

      // 2. Kullanıcı profilini çek (@me)
      const userRes = await fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!userRes.ok) {
        res.redirect("/?auth_error=user_fetch_failed");
        return;
      }
      const discordUser = (await userRes.json()) as any;

      // 3. Kullanıcının sunucularını çek (@me/guilds)
      const guildsRes = await fetch("https://discord.com/api/v10/users/@me/guilds", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const rawGuilds = guildsRes.ok ? ((await guildsRes.json()) as any[]) : [];

      // 4. Oturum oluştur
      const sessionId = crypto.randomUUID();
      const avatarUrl = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=128`
        : `https://cdn.discordapp.com/embed/avatars/${Number(discordUser.id || 0) % 5}.png`;

      sessionStore.set(sessionId, {
        user: {
          id: discordUser.id,
          username: discordUser.global_name || discordUser.username,
          tag:
            discordUser.discriminator && discordUser.discriminator !== "0"
              ? `${discordUser.username}#${discordUser.discriminator}`
              : discordUser.username,
          avatarUrl,
        },
        rawGuilds,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });

      res.setHeader(
        "Set-Cookie",
        `syncbot_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
      );

      res.redirect("/?auth=success&open_servers=1");
    } catch (err: any) {
      console.error("[OAuth2] Callback hatası:", err);
      res.redirect("/?auth_error=" + encodeURIComponent(err.message));
    }
  });

  /**
   * Mevcut oturum bilgilerini ve Carl-bot tarzı sunucu listesini döner
   */
  router.get("/api/auth/me", (req: Request, res: Response) => {
    const cookies = parseCookies(req);
    const sessionId = cookies["syncbot_session"];
    const session = sessionId ? sessionStore.get(sessionId) : null;
    const clientId = getClientId();

    if (!session || session.expiresAt < Date.now()) {
      res.json({
        authenticated: false,
        user: null,
        guilds: [],
        hasClientSecret: Boolean(config.oauth.clientSecret),
      });
      return;
    }

    // Kullanıcının yetkili olduğu sunucuları filtrele (Owner, Admin 0x8 veya ManageGuild 0x20)
    const manageableGuilds: ManageableGuildItem[] = [];

    for (const g of session.rawGuilds) {
      const isOwner = Boolean(g.owner);
      const permBig = BigInt(g.permissions || "0");
      const isAdmin = (permBig & 0x8n) !== 0n;
      const isManager = (permBig & 0x20n) !== 0n;

      if (!isOwner && !isAdmin && !isManager) continue;

      const botGuild = client.guilds.cache.get(g.id);
      const hasBot = Boolean(botGuild);
      const iconUrl = g.icon
        ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128`
        : "";

      // Doğrudan o sunucuyu pre-select eden davet linki
      const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands&guild_id=${g.id}`;

      manageableGuilds.push({
        id: g.id,
        name: g.name,
        icon: g.icon,
        iconUrl,
        isOwner,
        hasBot,
        memberCount: botGuild ? botGuild.memberCount : null,
        inviteUrl,
      });
    }

    // Sıralama: Önce botun ekli olduğu sunucular, sonra alfabetik
    manageableGuilds.sort((a, b) => {
      if (a.hasBot && !b.hasBot) return -1;
      if (!a.hasBot && b.hasBot) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({
      authenticated: true,
      user: session.user,
      guilds: manageableGuilds,
      hasClientSecret: Boolean(config.oauth.clientSecret),
    });
  });

  /**
   * Çıkış Yap
   */
  router.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookies = parseCookies(req);
    const sessionId = cookies["syncbot_session"];
    if (sessionId) sessionStore.delete(sessionId);

    res.setHeader("Set-Cookie", "syncbot_session=; Path=/; HttpOnly; Max-Age=0");
    res.json({ success: true });
  });

  return router;
}
