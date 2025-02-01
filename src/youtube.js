const { google } = require("googleapis");
const { readFile } = require("fs").promises;
const config = require("../config.json");
const path = require("path");
const fs = require("fs");
const readline = require("readline");

// YouTube API anahtarı ve diğer sabitler
const TOKEN_PATH = path.join(__dirname, "../config/youtube_token.json");

const oauth2Client = new google.auth.OAuth2(
  config.youtube.client_id,
  config.youtube.client_secret,
  config.youtube.redirect_uri
);

// Token'ı kaydetme ve yükleme fonksiyonları
async function saveToken(token) {
  try {
    await fs.promises.mkdir(path.dirname(TOKEN_PATH), { recursive: true });
    await fs.promises.writeFile(TOKEN_PATH, JSON.stringify(token));
    console.log("Token kaydedildi:", TOKEN_PATH);
  } catch (err) {
    console.error("Token kaydetme hatası:", err);
  }
}

async function loadToken() {
  try {
    const token = await fs.promises.readFile(TOKEN_PATH);
    return JSON.parse(token);
  } catch (err) {
    return null;
  }
}

// Yetkilendirme fonksiyonu
async function authorize() {
  try {
    let token = await loadToken();

    if (token) {
      oauth2Client.credentials = token;
      return oauth2Client;
    }

    // Yetkilendirme URL'ini oluştur
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/youtube.upload"],
    });

    console.log("Bu URL'i tarayıcıda açın ve yetkilendirmeyi tamamlayın:");
    console.log(authUrl);

    // Kullanıcıdan kodu al
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const code = await new Promise((resolve) => {
      rl.question("Yetkilendirme kodunu buraya yapıştırın: ", (code) => {
        rl.close();
        resolve(code);
      });
    });

    // Token'ı al ve kaydet
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.credentials = tokens;
    await saveToken(tokens);

    return oauth2Client;
  } catch (error) {
    console.error("YouTube yetkilendirme hatası:", error);
    return null;
  }
}

// YouTube'a Short video yükle
async function uploadShort(videoPath, title, progressCallback) {
  try {
    const auth = await authorize();
    if (!auth) {
      throw new Error("YouTube yetkilendirmesi başarısız!");
    }

    const youtube = google.youtube({ version: "v3", auth });

    // İlerleme bildirimi
    if (progressCallback) {
      await progressCallback(20);
    }

    console.log("Video yükleniyor...");

    const res = await youtube.videos.insert({
      part: "snippet,status",
      requestBody: {
        snippet: {
          title: `${title}`,
          description: `${title}\n\n${config.youtube.upload_settings.description_template}`,
          categoryId: config.youtube.upload_settings.category_id,
          tags: config.youtube.upload_settings.tags,
        },
        status: {
          privacyStatus: "public",
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: fs.createReadStream(videoPath),
      },
    });

    // İlerleme bildirimi
    if (progressCallback) {
      await progressCallback(100);
    }

    console.log("Video başarıyla yüklendi!");
    return {
      url: `https://youtube.com/shorts/${res.data.id}`,
      id: res.data.id,
    };
  } catch (error) {
    console.error("YouTube yükleme hatası:", error);
    throw error;
  }
}

// İlk yetkilendirmeyi başlat
if (require.main === module) {
  authorize()
    .then(() => {
      console.log("Yetkilendirme tamamlandı!");
    })
    .catch(console.error);
}

module.exports = {
  uploadShort,
};
