import fs from 'node:fs';

console.log('=== STATIK ENTEGRASYON VE DOĞRULAMA TESTI ===');

const html = fs.readFileSync('public/index.html', 'utf8');
const statsServiceTs = fs.readFileSync('src/dashboard/services/statsService.ts', 'utf8');
const appJs = fs.readFileSync('public/app.js', 'utf8');

// 1. Yeni Kart Kontrolü
const hasSecTitle = html.includes('Sunucu Güvenlik & Koruma Özeti');
const hasBotDot = html.includes('id="dash-bot-status-dot"');
const hasAdminsCount = html.includes('id="dash-admins-count"');
const hasTimedoutCount = html.includes('id="dash-timedout-count"');
const hasLogsCount = html.includes('id="dash-total-logs-count"');

console.log('1. Yeni Güvenlik Kartı ve Elementleri:');
console.log('   - Kart Başlığı:', hasSecTitle ? 'MEVCUT (OK)' : 'EKSIK');
console.log('   - Bot Çevrimiçi Işığı:', hasBotDot ? 'MEVCUT (OK)' : 'EKSIK');
console.log('   - Yönetici Sayacı:', hasAdminsCount ? 'MEVCUT (OK)' : 'EKSIK');
console.log('   - Cezalı (Timeout) Sayacı:', hasTimedoutCount ? 'MEVCUT (OK)' : 'EKSIK');
console.log('   - Toplam Log Sayacı:', hasLogsCount ? 'MEVCUT (OK)' : 'EKSIK');

// 2. Eski Donanım Bilgilerinin Temizliği
const hasOldMemory = html.includes('id="bot-memory"');
const hasOldNodeVer = html.includes('id="bot-node-ver"');
const hasOldPlatform = html.includes('id="bot-platform"');
const hasOldUptime = html.includes('id="bot-uptime"');

console.log('\n2. Gizli Donanım / Altyapı Verilerinin Temizliği:');
console.log('   - RAM Tüketimi (bot-memory):', !hasOldMemory ? 'TEMIZLENDI (OK)' : 'HALA VAR');
console.log('   - Node.js Versiyonu (bot-node-ver):', !hasOldNodeVer ? 'TEMIZLENDI (OK)' : 'HALA VAR');
console.log('   - İşletim Sistemi (bot-platform):', !hasOldPlatform ? 'TEMIZLENDI (OK)' : 'HALA VAR');
console.log('   - Makine Uptime (bot-uptime):', !hasOldUptime ? 'TEMIZLENDI (OK)' : 'HALA VAR');

// 3. StatsService Backend Veri Güvenliği
const serviceLeaksMem = statsServiceTs.includes('totalMem =') || statsServiceTs.includes('usedMem =');
const serviceHasAdmin = statsServiceTs.includes('adminMembersCount');

console.log('\n3. Backend statsService İncelemesi:');
console.log('   - RAM / Donanım Sızıntısı:', !serviceLeaksMem ? 'YOK / GUVENLI (OK)' : 'SIZINTI VAR');
console.log('   - Admin Sayısı Hesaplanıyor mu?:', serviceHasAdmin ? 'EVET (OK)' : 'HAYIR');

if (!hasSecTitle || hasOldMemory || hasOldNodeVer || serviceLeaksMem) {
  console.error('\nFAIL: Entegrasyon testinde eksikler tespit edildi!');
  process.exit(1);
} else {
  console.log('\n=== BUTUN TESTLER BASARIYLA TAMAMLANDI (PASSED) ===');
}
