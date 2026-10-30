import { requireAuth, requireGuildPermission } from "../dist/dashboard/middleware/authMiddleware.js";
import { sessionStore } from "../dist/dashboard/routes/authRoutes.js";

console.log("=== API Güvenlik ve İzolasyon Doğrulama Testi (Birim/Unit Test) ===");

function createMockReqRes({ cookie, queryGuildId, bodyGuildId, headers = {} }) {
  const req = {
    headers: {
      cookie,
      ...headers
    },
    query: { guildId: queryGuildId },
    body: { guildId: bodyGuildId }
  };
  let statusCode = 200;
  let responseData = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    }
  };
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  return { req, res, next, getStatus: () => statusCode, getData: () => responseData, isNext: () => nextCalled };
}

// 1. Test: Oturumsuz istek requireAuth engeli
const test1 = createMockReqRes({});
requireAuth(test1.req, test1.res, test1.next);
console.log("1. Yetkisiz Kullanıcı -> HTTP Status:", test1.getStatus(), test1.getStatus() === 401 ? "(BAŞARILI: 401 Engellendi)" : "(BAŞARISIZ)");
if (test1.getStatus() !== 401 || test1.isNext()) throw new Error("Oturumsuz istek geçti!");

// 2. Test: Geçerli Oturumu Olan Kullanıcı Oluştur (Sunucu A'da yönetici, Sunucu B'de yetkisiz)
const validSessionId = "test-session-123";
sessionStore.set(validSessionId, {
  user: { id: "user_1", username: "AdminUser", tag: "AdminUser#0001", avatarUrl: "" },
  rawGuilds: [
    { id: "guild_A", name: "Sunucu A", owner: true, permissions: "8" },
    { id: "guild_B", name: "Sunucu B", owner: false, permissions: "0" } // Yetkisiz sunucu
  ],
  expiresAt: Date.now() + 60000
});

// 3. Test: Kullanıcı kendi sunucusunu (guild_A) isterse -> İzin verilmeli (next() çalışmalı)
const test3 = createMockReqRes({ cookie: `syncbot_session=${validSessionId}`, queryGuildId: "guild_A" });
requireGuildPermission(test3.req, test3.res, test3.next);
console.log("2. Yetkili Sunucu (guild_A) İstek -> Next çağrıldı mı:", test3.isNext() ? "(BAŞARILI: İzin verildi)" : "(BAŞARISIZ)");
if (!test3.isNext() || test3.getStatus() !== 200) throw new Error("Yetkili sunucuya erişim reddedildi!");

// 4. Test: Kullanıcı yetkisi olmayan sunucuyu (guild_B) veya bilmediği bir sunucuyu (guild_C) isterse -> 403 Forbidden dönmeli
const test4 = createMockReqRes({ cookie: `syncbot_session=${validSessionId}`, queryGuildId: "guild_B" });
requireGuildPermission(test4.req, test4.res, test4.next);
console.log("3. Yetkisiz Sunucu (guild_B) Çapraz İstek -> HTTP Status:", test4.getStatus(), test4.getStatus() === 403 ? "(BAŞARILI: 403 Engellendi)" : "(BAŞARISIZ)");
if (test4.getStatus() !== 403 || test4.isNext()) throw new Error("Yetkisiz sunucuya erişim engellenemedi!");

// 5. Test: Yabancı Sunucu (guild_C)
const test5 = createMockReqRes({ cookie: `syncbot_session=${validSessionId}`, queryGuildId: "guild_C" });
requireGuildPermission(test5.req, test5.res, test5.next);
console.log("4. Kayıtsız Yabancı Sunucu (guild_C) İstek -> HTTP Status:", test5.getStatus(), test5.getStatus() === 403 ? "(BAŞARILI: 403 Engellendi)" : "(BAŞARISIZ)");
if (test5.getStatus() !== 403 || test5.isNext()) throw new Error("Yabancı sunucuya erişim engellenemedi!");

console.log("=== TÜM GÜVENLİK TESTLERİ EKSİKSİZ GEÇTİ (PASSED) ===");
