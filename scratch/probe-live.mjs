async function test() {
  console.log('--- 1. Ana Sayfa (HTML) Kontrolü ---');
  const pageRes = await fetch('http://127.0.0.1:3000/');
  console.log('HTTP Status:', pageRes.status);
  const html = await pageRes.text();
  console.log('Yeni Güvenlik Kartı Var mı?:', html.includes('Sunucu Güvenlik & Koruma Özeti'));
  console.log('Eski RAM Bilgisi Kaldırıldı mı?:', !html.includes('id="bot-memory"'));
  console.log('Eski Node Sürümü Kaldırıldı mı?:', !html.includes('id="bot-node-ver"'));

  console.log('\n--- 2. Yetkisiz API İzolasyon Kontrolü ---');
  const statsRes = await fetch('http://127.0.0.1:3000/api/stats?guildId=123');
  console.log('/api/stats (Yetkisiz İstek) HTTP Status:', statsRes.status, statsRes.status === 401 ? '(BAŞARILI: 401 Engellendi)' : '(HATA)');

  const membersRes = await fetch('http://127.0.0.1:3000/api/members?guildId=123');
  console.log('/api/members (Yetkisiz İstek) HTTP Status:', membersRes.status, membersRes.status === 401 ? '(BAŞARILI: 401 Engellendi)' : '(HATA)');

  const logsRes = await fetch('http://127.0.0.1:3000/api/logs?guildId=123');
  console.log('/api/logs (Yetkisiz İstek) HTTP Status:', logsRes.status, logsRes.status === 401 ? '(BAŞARILI: 401 Engellendi)' : '(HATA)');

  console.log('\n--- 3. Genel Bilgiler (Landing) Kontrolü ---');
  const inviteRes = await fetch('http://127.0.0.1:3000/api/invite');
  const inviteJson = await inviteRes.json();
  console.log('/api/invite HTTP Status:', inviteRes.status, '| Bot Adı:', inviteJson.botName);
  console.log('\n=== CANLI TEST BAŞARIYLA TAMAMLANDI ===');
}
test();
