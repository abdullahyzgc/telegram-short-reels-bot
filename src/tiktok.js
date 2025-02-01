const fs = require("fs");
const axios = require("axios");
const Tiktok = require("@tobyg74/tiktok-api-dl");

// Video bilgilerini al
async function getVideoInfo(tiktokUrl) {
  try {
    console.log("Video bilgileri alınıyor...");
    const result = await Tiktok.Downloader(tiktokUrl, {
      version: "v1",
      showOriginalResponse: true,
    });

    const videoUrl = result.resultNotParsed.content.video.play_addr.url_list[0];

    if (!videoUrl) {
      throw new Error("Video bilgileri alınamadı");
    }

    return {
      url: videoUrl,
      title: result.resultNotParsed.content.desc || "",
      author: result.resultNotParsed.content.author.nickname || "",
    };
  } catch (error) {
    console.error("Video bilgisi alma hatası:", error);
    throw error;
  }
}

async function indirVideo(url, outputPath, onProgress = null) {
  try {
    if (onProgress) onProgress(0);

    // Video bilgilerini al
    if (onProgress) onProgress(10);
    const videoInfo = await getVideoInfo(url);

    if (onProgress) onProgress(30);

    // Videoyu indir
    const response = await axios({
      method: "GET",
      url: videoInfo.url,
      responseType: "stream",
      onDownloadProgress: (progressEvent) => {
        if (onProgress) {
          const progress = Math.round(
            30 + (progressEvent.loaded / progressEvent.total) * 60
          );
          onProgress(progress);
        }
      },
    });

    // Dosyaya kaydet
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", () => {
        if (onProgress) onProgress(100);
        resolve(outputPath);
      });
      writer.on("error", reject);
    });
  } catch (error) {
    console.error("Video indirme hatası:", error);
    throw error;
  }
}

module.exports = {
  indirVideo,
};
