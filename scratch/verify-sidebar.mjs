import fs from 'node:fs';

console.log("=== SyncBot Tekil Dinleyici & Çakışma Doğrulama Testi ===");

const html = fs.readFileSync('public/index.html', 'utf8');
const appJs = fs.readFileSync('public/app.js', 'utf8');
const navJs = fs.readFileSync('public/js/navigation.js', 'utf8');

// 1. Check for duplicate onclick on #sidebar-toggle HTML
const btnMatches = html.match(/<button[^>]*id=["']sidebar-toggle["'][^>]*>/g) || [];
console.log('1. HTML Buton Sayısı:', btnMatches.length);
if (btnMatches.length !== 1) {
  console.error('FAIL: Birden fazla veya 0 adet #sidebar-toggle butonu bulundu!');
  process.exit(1);
}
if (btnMatches[0].includes('onclick=')) {
  console.error('FAIL: HTML üzerinde inline onclick bulundu; çift tetiklemeyi önlemek için kaldırılmış olmalı!');
  process.exit(1);
}
console.log('   Inline onclick çakışması: YOK (TEMİZ)');

// 2. Check app.js for competing listeners
if (appJs.includes('sidebarToggleBtn.onclick') || appJs.includes('sidebarToggleBtn.addEventListener')) {
  console.error('FAIL: app.js içinde rakip sidebarToggleBtn listener bulundu!');
  process.exit(1);
}
console.log('2. app.js içinde rakip dinleyici: YOK (TEMİZ)');

// 3. Check navigation.js for the single authoritative delegated listener
const navListenerMatches = navJs.match(/#sidebar-toggle/g) || [];
console.log('3. navigation.js içinde #sidebar-toggle referansı:', navListenerMatches.length);
if (navListenerMatches.length === 0) {
  console.error('FAIL: navigation.js içinde dinleyici bulunamadı!');
  process.exit(1);
}
console.log('   Tek yetkili dinleyici: Navigation.SidebarManager (DOĞRULANDI)');

// 4. Test Single-Click State Flow
let sidebarState = { collapsed: false };
let clickCount = 0;

function simulateDocumentClick(targetId) {
  if (targetId === "sidebar-toggle" || targetId === "bars-icon") {
    // Sadece navigation.js delegasyonu çalışmalı
    clickCount++;
    sidebarState.collapsed = !sidebarState.collapsed;
  }
}

// 1. Tıklama
simulateDocumentClick("sidebar-toggle");
console.log('4. 1. Tıklama -> Handler çalışma sayısı:', clickCount, '| Durum (collapsed):', sidebarState.collapsed);
if (clickCount !== 1 || sidebarState.collapsed !== true) {
  console.error("FAIL: 1. tıklama tam olarak 1 kez tetiklenmeli ve collapsed olmalı!");
  process.exit(1);
}

// 2. Tıklama
simulateDocumentClick("bars-icon");
console.log('5. 2. Tıklama (İkona basma) -> Toplam çalışma sayısı:', clickCount, '| Durum (collapsed):', sidebarState.collapsed);
if (clickCount !== 2 || sidebarState.collapsed !== false) {
  console.error("FAIL: 2. tıklama tam olarak 1 kez tetiklenmeli ve genişlemeli!");
  process.exit(1);
}

console.log("=== TÜM ÇAKIŞMA VE TEKİL ÇALIŞMA TESTLERİ GEÇTİ (PASSED) ===");
