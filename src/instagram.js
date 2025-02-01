const fs = require("fs");
const axios = require("axios");

// Video bilgilerini al
async function getVideoInfo(instagramUrl) {
  try {
    console.log("Video bilgileri alınıyor...");
    const apiUrl = `https://instagram-downloader-git-main-bybittercodes-projects.vercel.app/api/video?postUrl=${encodeURIComponent(
      instagramUrl
    )}`;
    const response = await axios.get(apiUrl);

    if (response.data.status !== "success" || !response.data.data.videoUrl) {
      throw new Error("Video bilgileri alınamadı");
    }

    return {
      url: response.data.data.videoUrl,
      title: response.data.data.title || "",
      description: response.data.data.description || "",
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
  getVideoInfo,
};
