#!/bin/bash
# SyncBot - Otomatik Güncelleme Betiği

# Proje dizinine geçiş yap
cd "$(dirname "$0")" || cd ~/Projeler/SyncBot/ || exit 1

echo "🚀 [SyncBot] Kodlar GitHub'dan çekiliyor..."
git pull

echo "📦 [SyncBot] Bağımlılıklar kontrol ediliyor..."
npm install

echo "🔨 [SyncBot] TypeScript derleniyor..."
npm run build

echo "🔄 [SyncBot] Servis yeniden başlatılıyor..."
if systemctl is-active --quiet syncbot; then
    sudo systemctl restart syncbot
    echo "✅ SyncBot servisi (systemd) başarıyla yeniden başlatıldı!"
elif command -v pm2 &> /dev/null && pm2 list | grep -q "syncbot"; then
    pm2 restart syncbot
    echo "✅ SyncBot (pm2) başarıyla yeniden başlatıldı!"
else
    echo "ℹ️ syncbot servisi bulunamadı veya manuel çalıştırılıyor. Başlatmak için: npm start veya npm run dev"
fi

echo "🎉 [SyncBot] Güncelleme işlemi tamamlandı!"
