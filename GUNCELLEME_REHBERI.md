# 🚀 GitHub Güncelleme Rehberi (Linux / CachyOS)

Windows üzerinde kodda bir değişiklik yapıp GitHub'a gönderdikten (`git push`) sonra, Linux (CachyOS) cihazınızda bu değişikliklerin geçerli olması için yapmanız gereken adımlar aşağıda özetlenmiştir.

* **Bot Adı / Servis Adı:** `syncbot`
* **Proje Dizin Yolu:** `~/Projeler/SyncBot/`

---

## ⚡ Hızlı Güncelleme (Tek Satırlık Komut)

Linux terminalinde proje dizinindeyken şu tek satırlık komutu çalıştırmanız tüm güncellemeyi tamamlar:

```bash
cd ~/Projeler/SyncBot && git pull && npm install && npm run build && sudo systemctl restart syncbot
```

*(Eğer `pm2` kullanıyorsanız: `cd ~/Projeler/SyncBot && git pull && npm install && npm run build && pm2 restart syncbot`)*

---

## 💡 En Kolay Yöntem: Tek Tuşla Güncelleme Betiği (`update.sh`)

Projeye sizin için hazır bir `update.sh` betiği eklendi. Linux tarafında ilk sefere mahsus çalıştırma izni verdikten sonra tüm güncellemeleri tek komutla yapabilirsiniz:

```bash
# İlk sefere mahsus izin verme (yalnızca 1 kez):
cd ~/Projeler/SyncBot
chmod +x update.sh

# Güncellemek istediğinizde çalıştırmanız gereken tek komut:
./update.sh
```

Bu betik otomatik olarak:
1. `~/Projeler/SyncBot` klasörüne geçer.
2. `git pull` ile GitHub'daki en güncel kodları çeker.
3. `npm install` ile bağımlılıkları günceller.
4. `npm run build` ile TypeScript kodlarını derler (`dist/`).
5. `syncbot` servisinizi (`systemd` veya `pm2`) otomatik algılayıp yeniden başlatır.

---

## 📋 Adım Adım Güncelleme İşlemi (Manuel)

### 1. Adım: Proje Klasörüne Geçiş Yapın
```bash
cd ~/Projeler/SyncBot
```

---

### 2. Adım: Yeni Kodları GitHub'dan Çekin
```bash
git pull
```
> Bu komut, GitHub'daki en güncel kodları indirir. Eğer *"Already up to date"* diyorsa tüm kodlarınız zaten günceldir.

---

### 3. Adım: Yeni Paketleri Yükleyin (Her İhtimale Karşı)
Yeni bir kütüphane eklendiyse (`package.json` güncellendiyse) eksik bağımlılıkları yüklemek için:
```bash
npm install
```

---

### 4. Adım: TypeScript Kodlarını Derleyin (Build)
Değiştirilen TypeScript dosyalarını çalıştırılabilir JavaScript (`dist/`) haline getirmek için:
```bash
npm run build
```

---

### 5. Adım: Bot Servisini Yeniden Başlatın

#### A) Eğer `systemd` ile çalıştırıyorsanız (Önerilen):
```bash
sudo systemctl restart syncbot
```
Çalışma durumunu kontrol etmek için:
```bash
sudo systemctl status syncbot
```

#### B) Eğer `pm2` ile çalıştırıyorsanız:
```bash
pm2 restart syncbot
```
Çalışma durumunu kontrol etmek için:
```bash
pm2 status
```

---

## 🔍 Logları ve Hataları Canlı İzleme

Güncelleme sonrası botun sorunsuz açıldığını doğrulamak veya canlı hareketleri/hataları görmek için terminalden logları izleyebilirsiniz:

* **`systemd` için canlı log:**
  ```bash
  journalctl -u syncbot -f -n 50
  ```
  *(Çıkmak için: `Ctrl + C`)*

* **`pm2` için canlı log:**
  ```bash
  pm2 logs syncbot
  ```
  *(Çıkmak için: `Ctrl + C`)*

---

## ⚠️ Özel Durumlar

### 1. `.env` Dosyası Değiştiğinde:
Eğer `.env` içine yeni bir ayar veya şifre eklediyseniz, `.env` dosyası Git'e gitmediği için bunu Linux cihazınızda elle eklemeniz gerekir:
```bash
nano .env
```
Gerekli satırı ekleyip `Ctrl + O` -> `Enter` -> `Ctrl + X` ile kaydedin ve ardından servisi yeniden başlatın.

### 2. Çakışma (Conflict) veya Değişiklik Hatası Alırsanız:
Eğer Linux tarafında yanlışlıkla bir dosyayı değiştirip `git pull` yaparken hata alırsanız, yerel değişiklikleri sıfırlayıp GitHub'daki temiz hali çekmek için:
```bash
git reset --hard origin/main
git pull
```
*(Not: Bu işlem `.env` dosyanızı silmez, çünkü `.env` git takibinde değildir).*
