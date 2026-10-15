#!/bin/bash
# Syncodech Discord Bot - Otomatik Güncelleme Betiği

echo "🚀 Kodlar GitHub'dan çekiliyor..."
git pull

echo "📦 Bağımlılıklar güncelleniyor..."
npm install

echo "🔨 TypeScript derleniyor..."
npm run build

echo "🔄 Servis yeniden başlatılıyor..."
if systemctl is-active --quiet discordbot; then
    sudo systemctl restart discordbot
    echo "✅ Discord Bot servisi (systemd) yeniden başlatıldı!"
elif command -v pm2 &> /dev/null && pm2 list | grep -q "discordbot"; then
    pm2 restart discordbot
    echo "✅ Discord Bot (pm2) yeniden başlatıldı!"
else
    echo "ℹ️ Servis bulunamadı veya manuel çalıştırılıyor. Manuel başlatmak için: npm start veya npm run dev"
fi

echo "🎉 Güncelleme başarıyla tamamlandı!"
