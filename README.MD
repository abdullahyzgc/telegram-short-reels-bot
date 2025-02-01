# 🤖 Short Video Bot

Bu bot, TikTok ve Instagram videolarını indirip, üzerine metin ekleyerek Instagram Reels ve YouTube Shorts olarak paylaşmanızı sağlar.

## 📋 Özellikler

- 📥 TikTok ve Instagram video indirme
- ✨ Video üzerine özelleştirilebilir metin ekleme
- 📱 Instagram Reels paylaşımı
- 📺 YouTube Shorts paylaşımı
- 🔄 Çapraz platform paylaşımı
- 📅 Planlı paylaşımlar
- 📊 Detaylı log sistemi
- 👥 Çoklu kullanıcı desteği

## 🛠️ Kurulum

### Gereksinimler

- Node.js (v16 veya üzeri)
- npm veya yarn
- FFmpeg (otomatik kurulacak)

### Adımlar

1. Projeyi klonlayın:
```bash
git clone https://github.com/kullaniciadi/short-video-bot.git
cd short-video-bot
```

2. Bağımlılıkları yükleyin:
```bash
npm install
```

3. `config.json` dosyasını oluşturun:
```json
{
  "instagram": {
    "username": "INSTAGRAM_KULLANICI_ADI",
    "password": "INSTAGRAM_SIFRE"
  },
  "youtube": {
    "client_id": "YOUTUBE_CLIENT_ID",
    "client_secret": "YOUTUBE_CLIENT_SECRET",
    "redirect_uri": "http://localhost",
    "refresh_token": "",
    "upload_settings": {
      "description_template": "#shorts #shortsvideo #shortvideo #viral #trending",
      "tags": ["shorts", "shortsvideo", "short", "viral", "trending"],
      "category_id": "24"
    }
  },
  "bot": {
    "allowedUsers": [],
    "watermark": "Marka Yazısı",
    "token": "TELEGRAM_BOT_TOKEN"
  }
}
```

## 🔑 API Anahtarları ve Yetkilendirme

### Telegram Bot Token Alma

1. [@BotFather](https://t.me/BotFather) ile konuşma başlatın
2. `/newbot` komutunu gönderin
3. Bot için bir isim ve kullanıcı adı belirleyin
4. Verilen token'ı `config.json` dosyasındaki `bot.token` alanına ekleyin

### YouTube API Ayarları

1. [Google Cloud Console](https://console.cloud.google.com/)'a gidin
2. Yeni bir proje oluşturun
3. YouTube Data API v3'ü etkinleştirin
4. Kimlik bilgileri oluşturun:
   - OAuth 2.0 İstemci Kimliği seçin
   - Uygulama türü olarak "Masaüstü" seçin
   - Client ID ve Client Secret'ı `config.json` dosyasına ekleyin
5. Bot'u ilk kez çalıştırdığınızda:
   ```bash
   node src/youtube.js
   ```
   komutu ile yetkilendirme yapın

### Instagram Hesabı Bağlama

1. `config.json` dosyasına Instagram kullanıcı adı ve şifrenizi ekleyin
2. İki faktörlü doğrulamayı kapatın veya yedek kodları hazır bulundurun
3. Bot ilk çalıştığında otomatik olarak giriş yapacaktır

## 📂 Dosya Yapısı

- `/assets` - Template dosyaları
- `/config` - Yetkilendirme dosyaları
- `/logs` - Bot logları
- `/temp` - Geçici dosyalar
- `/videos` - İndirilen ve işlenen videolar

## 🎨 Template Sistemi

Template dosyası `/assets/template.png` konumunda bulunmalıdır.

## 👥 Yetkilendirme Sistemi

1. Bot'u başlatın ve `/start` komutunu gönderin
2. Ayarlar menüsünden Telegram ID'nizi öğrenin
3. Bu ID'yi `config.json` dosyasındaki `allowedUsers` dizisine ekleyin
4. `allowedUsers` boş bırakılırsa bot herkese açık olur

## 📊 Log Sistemi

- Loglar `/logs` klasöründe günlük olarak tutulur
- Her log kaydında tarih, saat ve işlem detayları bulunur
- Hata durumlarında otomatik olarak loglanır

## 🚀 Çalıştırma

```bash
# Bot'u başlatmak için
node src/bot.js

# YouTube yetkilendirmesi için
node src/youtube.js
```

## 📝 Video Kategorileri

YouTube video kategorileri ve ID'leri:

- Film & Animasyon - ID: 1
- Otomobil & Araçlar - ID: 2
- Müzik - ID: 10
- Evcil Hayvanlar & Hayvanlar - ID: 15
- Spor - ID: 17
- Kısa Filmler - ID: 18
- Seyahat & Etkinlikler - ID: 19
- Oyun - ID: 20
- Video Bloğu - ID: 21
- İnsanlar & Bloglar - ID: 22
- Komedi - ID: 23
- Eğlence - ID: 24
- Haberler & Politika - ID: 25
- Nasıl Yapılır & Stil - ID: 26
- Eğitim - ID: 27
- Bilim & Teknoloji - ID: 28
- Aktivizm & Kâr Amacı Gütmeyen - ID: 29

## ⚠️ Limitler ve Kısıtlamalar

### YouTube
- Doğrulanmamış hesaplar: Günlük 15 video
- Doğrulanmış hesaplar: Günlük 100 video
- Short video uzunluğu: Maksimum 60 saniye

### Instagram
- Reels video uzunluğu: Maksimum 90 saniye
- Günlük paylaşım limiti: Hesap yaşına göre değişir

## 🤝 Katkıda Bulunma

1. Bu projeyi fork edin
2. Yeni bir branch oluşturun (`git checkout -b feature/yeniOzellik`)
3. Değişikliklerinizi commit edin (`git commit -am 'Yeni özellik: XYZ'`)
4. Branch'inizi push edin (`git push origin feature/yeniOzellik`)
5. Pull Request oluşturun

## 📄 Lisans

Bu proje MIT lisansı altında lisanslanmıştır. Detaylar için [LICENSE](LICENSE) dosyasına bakın.