const { IgApiClient } = require("instagram-private-api");
const { readFile } = require("fs").promises;
const config = require("../config.json");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
ffmpeg.setFfmpegPath(ffmpegPath);

// State dosyası yolu
const STATE_FILE = path.join(__dirname, "../config/instagram_state.json");

// Instagram istemcisi
const ig = new IgApiClient();

// Video'dan thumbnail oluştur
async function createThumbnail(videoPath) {
  return new Promise((resolve, reject) => {
    const thumbnailPath = videoPath.replace(".mp4", "_thumb.jpg");

    ffmpeg(videoPath)
      .on("error", (err) => {
        console.error("FFmpeg hatası:", err);
        reject(new Error("Thumbnail oluşturulamadı"));
      })
      .on("end", () => {
        resolve(thumbnailPath);
      })
      .screenshots({
        timestamps: ["5"], // 5. saniyeden
        filename: path.basename(thumbnailPath),
        folder: path.dirname(thumbnailPath),
        size: "1080x1920",
      });
  });
}

// State'i kaydet
async function saveState() {
  const serialized = await ig.state.serialize();
  delete serialized.constants; // Constants'ı kaldır
  await fs.promises.writeFile(STATE_FILE, JSON.stringify(serialized));
}

// State'i yükle
async function loadState() {
  try {
    const buffer = await fs.promises.readFile(STATE_FILE);
    const serialized = JSON.parse(buffer.toString());
    await ig.state.deserialize(serialized);
    return true;
  } catch (error) {
    return false;
  }
}

// Instagram'a giriş yap
async function login() {
  try {
    // Cihaz ID'si oluştur
    ig.state.generateDevice(config.instagram.username);

    // Kayıtlı state varsa yükle
    const hasState = await loadState();

    if (!hasState) {
      // Giriş öncesi simülasyon
      await ig.simulate.preLoginFlow();

      // Giriş yap
      const loggedInUser = await ig.account.login(
        config.instagram.username,
        config.instagram.password
      );
      console.log("Instagram girişi başarılı:", loggedInUser.username);

      // Giriş sonrası simülasyon
      process.nextTick(async () => {
        try {
          await ig.simulate.postLoginFlow();
        } catch (error) {
          console.log("Post login flow hatası (önemli değil):", error.message);
        }
      });

      // State'i kaydet
      await saveState();
    } else {
      console.log("Kayıtlı oturum kullanılıyor");
    }

    return true;
  } catch (error) {
    console.error("Instagram giriş hatası:", error);
    throw error;
  }
}

// Reels video yükle
async function uploadReels(videoPath, caption, progressCallback) {
  try {
    // Instagram hesabına giriş yap
    await login();

    if (progressCallback) {
      await progressCallback(20);
    }

    // Thumbnail oluştur
    const thumbnailPath = await createThumbnail(videoPath);

    if (progressCallback) {
      await progressCallback(40);
    }

    // Video ve thumbnail dosyalarını oku
    const videoBuffer = await readFile(videoPath);
    const coverBuffer = await readFile(thumbnailPath);

    if (progressCallback) {
      await progressCallback(60);
    }

    // Video yükle
    const publishResult = await ig.publish.video({
      video: videoBuffer,
      coverImage: coverBuffer,
      caption: caption,
      width: 1080,
      height: 1920,
      mediaType: "VIDEO",
      isReels: true,
      forAlbum: false,
    });

    if (progressCallback) {
      await progressCallback(90);
    }

    // Thumbnail dosyasını temizle
    try {
      await fs.promises.unlink(thumbnailPath);
    } catch (error) {
      console.error("Thumbnail temizleme hatası:", error);
    }

    if (progressCallback) {
      await progressCallback(100);
    }

    return {
      url: `https://www.instagram.com/reel/${publishResult.media.code}`,
      id: publishResult.media.id,
    };
  } catch (error) {
    console.error("Instagram yükleme hatası:", error);
    throw error;
  }
}

module.exports = {
  uploadReels,
};
