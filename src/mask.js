const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffprobePath = require("@ffprobe-installer/ffprobe").path;
const { createCanvas, loadImage } = require("canvas");
const fs = require("fs").promises;
const path = require("path");

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// Metni satırlara bölen fonksiyon
function wrapText(context, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = context.measureText(currentLine + " " + word).width;
    if (width < maxWidth) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
}

// Şablon bilgileri
const TEMPLATES = {
  classic: {
    name: "Klasik Şablon",
    background: {
      color: "black",
      opacity: 0.85,
    },
    frame: {
      width: 920,
      height: 1470,
      color: "white",
      opacity: 0.1,
      radius: 20,
      y_offset: 135,
    },
    text: {
      color: "white",
      size: 72,
      y_offset: 50,
      font: "Ubuntu",
      strokeWidth: 2,
      strokeColor: "black",
    },
  },
  modern: {
    name: "Modern Şablon",
    background: {
      color: "#1a1a1a",
      opacity: 0.9,
    },
    frame: {
      width: 920,
      height: 1470,
      color: "#00ff00",
      opacity: 0.15,
      radius: 30,
      y_offset: 135,
    },
    text: {
      color: "#00ff00",
      size: 80,
      y_offset: 40,
      font: "Ubuntu",
      strokeWidth: 3,
      strokeColor: "#1a1a1a",
    },
  },
  minimal: {
    name: "Minimal Şablon",
    background: {
      color: "#000000",
      opacity: 0.75,
    },
    frame: {
      width: 920,
      height: 1470,
      color: "#ffffff",
      opacity: 0.05,
      radius: 25,
      y_offset: 135,
    },
    text: {
      color: "#ffffff",
      size: 65,
      y_offset: 60,
      font: "Ubuntu",
      strokeWidth: 1,
      strokeColor: "#000000",
    },
  },
};

// Şablon oluştur
async function createTemplate(text, templateName = "classic") {
  const template = TEMPLATES[templateName];
  if (!template) throw new Error("Geçersiz şablon adı");

  const canvas = createCanvas(1080, 1920);
  const ctx = canvas.getContext("2d");

  // Arka plan
  ctx.fillStyle = template.background.color;
  ctx.globalAlpha = template.background.opacity;
  ctx.fillRect(0, 0, 1080, 1920);

  // Çerçeve
  ctx.globalAlpha = template.frame.opacity;
  ctx.fillStyle = template.frame.color;
  roundRect(
    ctx,
    (1080 - template.frame.width) / 2,
    template.frame.y_offset,
    template.frame.width,
    template.frame.height,
    template.frame.radius
  );

  // Metin
  ctx.globalAlpha = 1;
  ctx.font = `${template.text.size}px "${template.text.font}"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // Metin gölgesi
  ctx.lineWidth = template.text.strokeWidth;
  ctx.strokeStyle = template.text.strokeColor;
  ctx.strokeText(text, 1080 / 2, template.text.y_offset);

  // Metin
  ctx.fillStyle = template.text.color;
  ctx.fillText(text, 1080 / 2, template.text.y_offset);

  return canvas;
}

// Yuvarlak köşeli dikdörtgen çizimi
function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

// Template üzerine metin yazma fonksiyonu
async function createTemplateWithText(templatePath, text, outputPath) {
  try {
    const image = await loadImage(templatePath);
    const canvas = createCanvas(1080, 1920);
    const ctx = canvas.getContext("2d");

    // Template'i çiz
    ctx.drawImage(image, 0, 0, 1080, 1920);

    // Metin ayarları
    ctx.font = "40px Arial";
    ctx.fillStyle = "black";
    ctx.textAlign = "left";

    // Metni satırlara böl
    const maxWidth = 940;
    const lines = wrapText(ctx, text, maxWidth);

    // Her satırı çiz
    let y = 270;
    const lineHeight = 50;
    const leftMargin = 85;
    lines.forEach((line) => {
      ctx.fillText(line, leftMargin, y);
      y += lineHeight;
    });

    // Sonucu kaydet
    const buffer = canvas.toBuffer("image/png");
    await fs.writeFile(outputPath, buffer);
    return outputPath;
  } catch (error) {
    console.error("Template oluşturma hatası:", error);
    throw error;
  }
}

function getVideoInfo(videoPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }

      const videoStream = metadata.streams.find(
        (stream) => stream.codec_type === "video"
      );
      resolve({
        width: videoStream.width,
        height: videoStream.height,
        duration: metadata.format.duration,
      });
    });
  });
}

async function compressVideo(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec("libx264")
      .size("720x?")
      .videoBitrate("1000k")
      .outputOptions(["-preset veryfast", "-crf 28", "-movflags +faststart"])
      .on("end", () => resolve(outputPath))
      .on("error", (err) => reject(err))
      .save(outputPath);
  });
}

// Video optimizasyon profilleri
const OPTIMIZATION_PROFILES = {
  instagram: {
    maxDuration: 90, // saniye
    videoBitrate: "4000k",
    audioBitrate: "128k",
    fps: 30,
    width: 1080,
    height: 1920,
    format: "mp4",
  },
  youtube: {
    maxDuration: 60,
    videoBitrate: "6000k",
    audioBitrate: "192k",
    fps: 60,
    width: 1080,
    height: 1920,
    format: "mp4",
  },
};

async function maskVideo(inputVideo, outputPath, text, onProgress = null) {
  return new Promise(async (resolve, reject) => {
    try {
      // Template dosya yolunu oluştur
      const templateImage = path.join(__dirname, "../assets/template.png");

      // Video bilgilerini al
      const videoInfo = await getVideoInfo(inputVideo);
      console.log("Video bilgileri:", videoInfo);

      // Geçici dosya yolları
      const textTemplatePath = path.join(
        path.dirname(outputPath),
        "temp_template.png"
      );
      const tempMaskedPath = path.join(
        path.dirname(outputPath),
        "temp_masked.mp4"
      );

      // Template üzerine metin yaz
      await createTemplateWithText(templateImage, text, textTemplatePath);
      if (onProgress) onProgress(20);

      // Template ve videoyu birleştir
      await new Promise((resolve, reject) => {
        let lastProgress = 20;
        ffmpeg()
          .input(inputVideo)
          .input(textTemplatePath)
          .videoCodec("libx264")
          .outputOptions([
            "-pix_fmt yuv420p",
            "-preset ultrafast",
            "-movflags +faststart",
          ])
          .complexFilter([
            "[0:v]scale=920:1470:force_original_aspect_ratio=decrease,pad=920:1470:(ow-iw)/2:(oh-ih)/2[scaled]",
            "[1:v]scale=1080:1920[bg]",
            "[bg][scaled]overlay=x=(W-w)/2+2:y=(H-h)/2+135[out]",
          ])
          .map("[out]")
          .save(tempMaskedPath)
          .on("progress", (progress) => {
            if (onProgress) {
              // FFmpeg progress 0-100 arasında değil, süreye göre
              // Bu yüzden yaklaşık bir hesaplama yapıyoruz
              const currentProgress = Math.min(
                20 + Math.round((progress.percent || 0) * 0.6),
                80
              );
              if (currentProgress > lastProgress) {
                lastProgress = currentProgress;
                onProgress(currentProgress);
              }
            }
          })
          .on("end", resolve)
          .on("error", reject);
      });

      // Videoyu sıkıştır
      console.log("Video sıkıştırılıyor...");
      if (onProgress) onProgress(80);
      await compressVideo(tempMaskedPath, outputPath);
      if (onProgress) onProgress(100);

      // Geçici dosyaları temizle
      await fs.unlink(textTemplatePath);
      await fs.unlink(tempMaskedPath);

      resolve(outputPath);
    } catch (error) {
      console.error("Hata:", error);
      reject(error);
    }
  });
}

// Önizleme oluştur
async function createPreview(inputPath, text, templateName = "classic") {
  try {
    // Şablon oluştur
    const canvas = await createTemplate(text, templateName);
    const templateBuffer = canvas.toBuffer("image/png");
    const templatePath = inputPath.replace(".mp4", "_preview_template.png");
    const previewPath = inputPath.replace(".mp4", "_preview.mp4");
    await fs.writeFile(templatePath, templateBuffer);

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .input(templatePath)
        .complexFilter([
          "[0:v]scale=920:1470:force_original_aspect_ratio=decrease,pad=920:1470:(ow-iw)/2:(oh-ih)/2[scaled]",
          "[1:v]scale=1080:1920[bg]",
          "[bg][scaled]overlay=x=(W-w)/2:y=135[out]",
        ])
        .map("[out]")
        .outputOptions(["-t 3", "-c:v libx264", "-preset ultrafast", "-crf 28"])
        .output(previewPath)
        .on("end", async () => {
          // Geçici şablon dosyasını temizle
          try {
            await fs.unlink(templatePath);
          } catch (error) {
            console.error("Şablon temizleme hatası:", error);
          }
          resolve(previewPath);
        })
        .on("error", reject)
        .run();
    });
  } catch (error) {
    throw new Error(`Önizleme oluşturma hatası: ${error.message}`);
  }
}

// Kullanılabilir şablonları getir
function getTemplates() {
  return Object.entries(TEMPLATES).map(([id, template]) => ({
    id,
    name: template.name,
  }));
}

module.exports = {
  maskVideo,
  createPreview,
  getTemplates,
  TEMPLATES,
  OPTIMIZATION_PROFILES,
};
