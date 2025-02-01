const TelegramBot = require("node-telegram-bot-api");
const { indirVideo: indirTiktokVideo } = require("./tiktok");
const { indirVideo: indirInstagramVideo } = require("./instagram");
const { uploadReels } = require("./instagram-upload");
const { maskVideo, createPreview, getTemplates, TEMPLATES } = require("./mask");
const { uploadShort } = require("./youtube");
const path = require("path");
const fs = require("fs").promises;

// Config dosyasını oku
let config = {};
try {
  config = require("../config.json");
} catch (error) {
  console.error("Config dosyası okunamadı:", error);
  process.exit(1);
}

// Bot token buraya gelecek
const token = config.bot.token;
const bot = new TelegramBot(token, { polling: true });

// Geçici dosyalar için klasör
const TEMP_DIR = path.join(__dirname, "../temp");
const VIDEOS_DIR = path.join(__dirname, "../videos");
const LOG_DIR = path.join(__dirname, "../logs");
const SCHEDULED_FILE = path.join(__dirname, "../scheduled.json");
const VIDEOS_FILE = path.join(__dirname, "../videos.json");

// Kullanıcı durumlarını tutacak obje
const userStates = {};

// Planlı paylaşımları tutacak obje
let scheduledPosts = {};

// Config'i kaydet
async function saveConfig() {
  try {
    await fs.writeFile(
      path.join(__dirname, "../config.json"),
      JSON.stringify(config, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("Config kaydetme hatası:", error);
  }
}

// Ayarları kontrol et
function isUserAllowed(userId) {
  // Hiç izinli kullanıcı yoksa herkese izin ver
  if (config.bot.allowedUsers.length === 0) return true;
  // İzinli kullanıcıları kontrol et
  return config.bot.allowedUsers.includes(userId);
}

// Ayarları göster
async function showSettings(chatId) {
  const watermark = config.bot.watermark
    ? config.bot.watermark
    : "Marka yazısı ayarlanmamış";

  const opts = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🆔 Telegram ID'mi Öğren", callback_data: "show_my_id" }],
        [
          {
            text: "✏️ Marka Yazısını Düzenle",
            callback_data: "edit_watermark",
          },
        ],
        [{ text: "🏠 Ana Menü", callback_data: "return_main_menu" }],
      ],
    },
  };

  bot.sendMessage(
    chatId,
    `⚙️ Bot Ayarları\n\n` + `✏️ Marka Yazısı: ${watermark}`,
    opts
  );
}

// Dosya adını düzenle
function formatFileName(text) {
  return text
    .toLowerCase()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// İlerleme çubuğu oluştur
function createProgressBar(progress) {
  const barLength = 20;
  const filledLength = Math.round(barLength * (progress / 100));
  const emptyLength = barLength - filledLength;

  const filled = "█".repeat(filledLength);
  const empty = "▒".repeat(emptyLength);

  return `[${filled}${empty}] ${Math.round(progress)}%`;
}

// İlerleme mesajını güncelle
async function updateProgress(chatId, messageId, text, progress) {
  try {
    const progressBar = createProgressBar(progress);
    await bot.editMessageText(`${text}\n\n${progressBar}`, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "HTML",
    });
  } catch (error) {
    // Mesaj değişmemişse hatayı yoksay
    if (!error.message.includes("message is not modified")) {
      console.error("İlerleme güncelleme hatası:", error);
    }
  }
}

// Video kayıtlarını yükle
async function loadVideos() {
  try {
    const content = await fs.readFile(VIDEOS_FILE, "utf8");
    return JSON.parse(content);
  } catch (error) {
    return { videos: {} };
  }
}

// Video kayıtlarını kaydet
async function saveVideos(videos) {
  try {
    await fs.writeFile(VIDEOS_FILE, JSON.stringify(videos, null, 2));
  } catch (error) {
    console.error("Video kayıtları kaydedilemedi:", error);
  }
}

// Video listesini göster
async function showVideoList(chatId, isManageMode = false) {
  try {
    // Video kayıtlarını yükle
    const videosData = await loadVideos();
    const videos = videosData.videos;

    if (Object.keys(videos).length === 0) {
      return bot.sendMessage(chatId, "📂 Kayıtlı video bulunamadı!");
    }

    const keyboard = [];
    let index = 1;

    for (const videoId in videos) {
      const video = videos[videoId];
      if (!userStates[chatId]) userStates[chatId] = {};
      if (!userStates[chatId].videoMap) userStates[chatId].videoMap = {};

      userStates[chatId].videoMap[videoId] = {
        name: video.title,
        path: video.path,
        platforms: video.platforms || [],
      };

      const displayName = video.title.slice(0, 30);
      const platformIcons = video.platforms
        ? video.platforms
            .map((p) => (p === "instagram" ? "📱" : "📺"))
            .join(" ")
        : "";

      keyboard.push([
        {
          text: `${index}. ${displayName}${
            displayName.length >= 30 ? "..." : ""
          } ${platformIcons}`,
          callback_data: isManageMode
            ? `manage:${videoId}`
            : `select:${videoId}`,
        },
      ]);
      index++;
    }

    // Alt menü butonları
    keyboard.push([{ text: "🏠 Ana Menü", callback_data: "return_main_menu" }]);

    if (!isManageMode) {
      keyboard.splice(keyboard.length - 1, 0, [
        { text: "🗑️ Videoları Yönet", callback_data: "manage_videos" },
      ]);
    }

    const opts = {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    };

    const message = isManageMode
      ? "🗑️ Silmek istediğiniz videoyu seçin:"
      : "📂 Kayıtlı videolar:";

    bot.sendMessage(chatId, message, opts);
  } catch (error) {
    console.error("Video listesi hatası:", error);
    bot.sendMessage(chatId, "❌ Video listesi alınırken bir hata oluştu!");
  }
}

// Gerekli klasörleri oluştur
async function setupDirs() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
    await fs.mkdir(VIDEOS_DIR, { recursive: true });
    await fs.mkdir(LOG_DIR, { recursive: true });
    console.log("✅ Tüm klasörler başarıyla oluşturuldu!");
  } catch (error) {
    console.error("Klasör oluşturma hatası:", error);
    throw error;
  }
}

// Tarih formatını düzenle
function formatDate(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

// Planlı paylaşımları kaydet
async function saveScheduledPosts() {
  try {
    await fs.writeFile(
      SCHEDULED_FILE,
      JSON.stringify({ posts: scheduledPosts }, null, 2)
    );
  } catch (error) {
    console.error("Planlı paylaşımları kaydetme hatası:", error);
  }
}

// Planlı paylaşımları yükle
async function loadScheduledPosts() {
  try {
    const content = await fs.readFile(SCHEDULED_FILE, "utf8");
    const data = JSON.parse(content);
    return data.posts || {};
  } catch (error) {
    return {};
  }
}

// Planlı paylaşımları kontrol et ve logla
setInterval(async () => {
  try {
    // scheduled.json dosyasını oku
    const content = await fs.readFile(SCHEDULED_FILE, "utf8");
    const scheduledData = JSON.parse(content);

    const now = new Date();
    let hasChanges = false;

    for (const chatId in scheduledData.posts) {
      const userSchedule = scheduledData.posts[chatId];
      for (const postId in userSchedule) {
        const post = userSchedule[postId];

        // Planlanan tarih gelmiş mi kontrol et
        if (new Date(post.scheduledDate) <= now) {
          try {
            // Önce video dosyasının varlığını kontrol et
            try {
              await fs.access(post.videoPath);
            } catch (error) {
              throw new Error(`Video dosyası bulunamadı: ${post.videoPath}`);
            }

            await logAction({
              type: "SCHEDULED_POST_START",
              status: "info",
              chatId: chatId,
              postId: postId,
              platform: post.platform,
              scheduledDate: post.scheduledDate,
            });

            // Paylaşımı gerçekleştir
            const statusMessage = await bot.sendMessage(
              chatId,
              `📅 Planlı paylaşım başlatılıyor...\n\n[▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒] 0%`
            );

            if (post.platform === "instagram") {
              await updateProgress(
                chatId,
                statusMessage.message_id,
                "📤 Instagram'a yükleniyor...",
                10
              );

              const result = await uploadReels(post.videoPath, post.caption);

              await logAction({
                type: "INSTAGRAM_UPLOAD",
                status: "success",
                chatId: chatId,
                postId: postId,
                url: result.url,
              });

              await bot.editMessageText(
                `✅ Video başarıyla Instagram'a yüklendi!\n\n` +
                  `🎥 Video URL: ${result.url}\n` +
                  `📝 Açıklama: ${post.caption}`,
                {
                  chat_id: chatId,
                  message_id: statusMessage.message_id,
                  disable_web_page_preview: true,
                }
              );
            } else if (post.platform === "youtube") {
              await updateProgress(
                chatId,
                statusMessage.message_id,
                "📤 YouTube'a yükleniyor...",
                10
              );

              const result = await uploadShort(post.videoPath, post.caption);

              await logAction({
                type: "YOUTUBE_UPLOAD",
                status: "success",
                chatId: chatId,
                postId: postId,
                url: result.url,
              });

              await bot.editMessageText(
                `✅ Video başarıyla YouTube'a yüklendi!\n\n` +
                  `🎥 Video URL: ${result.url}\n` +
                  `📝 Başlık: ${post.caption}`,
                {
                  chat_id: chatId,
                  message_id: statusMessage.message_id,
                  disable_web_page_preview: true,
                }
              );
            }

            // Paylaşımı listeden kaldır
            delete scheduledData.posts[chatId][postId];
            hasChanges = true;

            await logAction({
              type: "SCHEDULED_POST_COMPLETE",
              status: "success",
              chatId: chatId,
              postId: postId,
              platform: post.platform,
            });
          } catch (error) {
            console.error("Planlı paylaşım hatası:", error);

            await logAction({
              type: "SCHEDULED_POST_ERROR",
              status: "error",
              chatId: chatId,
              postId: postId,
              platform: post.platform,
              error: error.message,
            });

            // Kullanıcıya hata mesajı gönder
            bot.sendMessage(
              chatId,
              `❌ Planlı paylaşım yapılırken bir hata oluştu:\n${error.message}\n\n` +
                `Platform: ${
                  post.platform === "instagram" ? "Instagram" : "YouTube"
                }\n` +
                `Tarih: ${formatDate(new Date(post.scheduledDate))}`
            );

            // Hatalı paylaşımı listeden kaldır
            delete scheduledData.posts[chatId][postId];
            hasChanges = true;
          }
        }
      }

      // Kullanıcının tüm paylaşımları tamamlandıysa objeyi temizle
      if (Object.keys(scheduledData.posts[chatId]).length === 0) {
        delete scheduledData.posts[chatId];
        hasChanges = true;
      }
    }

    // Değişiklik varsa kaydet
    if (hasChanges) {
      await fs.writeFile(
        SCHEDULED_FILE,
        JSON.stringify(scheduledData, null, 2)
      );
    }
  } catch (error) {
    console.error("Planlı paylaşım kontrolü hatası:", error);
  }
}, 60000);

// Planlı paylaşımları listele
async function showScheduledPosts(chatId) {
  try {
    // scheduled.json dosyasını oku
    const content = await fs.readFile(SCHEDULED_FILE, "utf8");
    const scheduledData = JSON.parse(content);

    const userSchedule = scheduledData.posts[chatId] || {};
    const posts = Object.values(userSchedule);

    if (posts.length === 0) {
      return bot.sendMessage(chatId, "📅 Planlanmış paylaşım bulunmuyor.");
    }

    const keyboard = [];
    posts.forEach((post, index) => {
      const platform = post.platform === "instagram" ? "Instagram" : "YouTube";
      const date = formatDate(new Date(post.scheduledDate));
      keyboard.push([
        {
          text: `${index + 1}. ${platform} - ${date}`,
          callback_data: `scheduled:${post.id}`,
        },
      ]);
    });

    keyboard.push([
      { text: "🗑️ Tümünü İptal Et", callback_data: "cancel_all_scheduled" },
      { text: "🏠 Ana Menü", callback_data: "return_main_menu" },
    ]);

    const opts = {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    };

    bot.sendMessage(
      chatId,
      "📅 Planlanmış Paylaşımlar:\n\nDetaylar için paylaşıma tıklayın.",
      opts
    );
  } catch (error) {
    console.error("Planlı paylaşımları listeleme hatası:", error);
    bot.sendMessage(
      chatId,
      "❌ Planlı paylaşımlar listelenirken bir hata oluştu!"
    );
  }
}

// Ana menüye planlı paylaşımlar butonu ekle
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const opts = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "📥 Instagram Video İndirme", callback_data: "instagram" },
          { text: "📥 TikTok Video İndirme", callback_data: "tiktok" },
        ],
        [{ text: "📂 Kayıtlı Videoları Göster", callback_data: "show_videos" }],
        [{ text: "📅 Planlı Paylaşımlar", callback_data: "scheduled_posts" }],
        [{ text: "⚙️ Ayarlar", callback_data: "settings" }],
        [
          {
            text: "🗑️ Geçmiş Mesajları Temizle",
            callback_data: "clear_messages",
          },
        ],
      ],
    },
  };
  bot.sendMessage(chatId, "Merhaba! Ne yapmak istersiniz?", opts);
});

// Buton tıklamaları
bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  // Ayarlar ve ID öğrenme her zaman erişilebilir olsun
  if (data === "settings" || data === "show_my_id") {
    if (data === "settings") {
      await showSettings(chatId);
    } else {
      bot.sendMessage(
        chatId,
        `🆔 Sizin Telegram ID'niz: \`${chatId}\`\n\n` +
          `Bot'u sadece siz kullanmak için bu ID'yi \`botSettings.allowedUsers\` dizisine eklemeniz gerekiyor.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "⚙️ Ayarlara Dön", callback_data: "settings" }],
            ],
          },
        }
      );
    }
    return;
  }

  // Diğer tüm işlemler için yetki kontrolü
  if (!isUserAllowed(chatId)) {
    return bot.sendMessage(
      chatId,
      "❌ Bu özelliği kullanmak için yetkiniz yok!\n\n" +
        "Ayarlar menüsünden Telegram ID'nizi öğrenip, bot yöneticisine iletebilirsiniz.",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "⚙️ Ayarlar", callback_data: "settings" }],
          ],
        },
      }
    );
  }

  if (data.startsWith("category:")) {
    const category = data.replace("category:", "");
    if (category === "all") {
      await showVideoList(chatId, false);
    } else {
      await showVideoList(chatId, false, category);
    }
  }
  // Video seçimi
  else if (data.startsWith("select:")) {
    const shortId = data.replace("select:", "");
    const videoFileName = userStates[chatId]?.videoMap?.[shortId];

    if (!videoFileName) {
      return bot.sendMessage(
        chatId,
        "❌ Video bulunamadı! Lütfen tekrar video listesine bakın."
      );
    }

    const videoPath = videoFileName.path;

    // Dosya adından orijinal açıklamayı çıkar
    const originalText = videoFileName.name
      .replace(/^masked_/, "")
      .replace(/_\d+\.mp4$/, "")
      .replace(/-/g, " ");

    userStates[chatId] = {
      ...userStates[chatId],
      processedVideo: videoPath,
      videoText: originalText,
      step: "waiting_share_platform",
    };

    // Platform seçim butonlarını göster
    const opts = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📱 Instagram Reels", callback_data: "instagram_upload" },
            { text: "📺 YouTube Shorts", callback_data: "youtube_upload" },
          ],
          [{ text: "🔄 İkisine de Paylaş", callback_data: "cross_upload" }],
          [{ text: "🏠 Ana Menü", callback_data: "return_main_menu" }],
        ],
      },
    };

    await bot.editMessageText(
      "✨ Video başarıyla hazırlandı! Nereye yüklemek istersiniz?",
      {
        chat_id: chatId,
        message_id: callbackQuery.message.message_id,
        reply_markup: opts.reply_markup,
      }
    );
  }
  // Çapraz paylaşım işlemi
  else if (data === "cross_upload") {
    const opts = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🚀 Şimdi Paylaş", callback_data: "share_now:both" },
            { text: "📅 İleri Tarih", callback_data: "schedule:both" },
          ],
          [{ text: "🏠 Ana Menü", callback_data: "return_main_menu" }],
        ],
      },
    };

    bot.sendMessage(
      chatId,
      "📱 Instagram ve YouTube'a ne zaman paylaşmak istersiniz?",
      opts
    );
  }
  // Video silme işlemi
  else if (data.startsWith("manage:")) {
    const shortId = data.replace("manage:", "");
    const videoFileName = userStates[chatId]?.videoMap?.[shortId];

    if (!videoFileName) {
      return bot.sendMessage(
        chatId,
        "❌ Video bulunamadı! Lütfen tekrar video listesine bakın."
      );
    }

    // Silme onayı için butonlar
    const confirmOpts = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ Evet, Sil",
              callback_data: `delete:${shortId}`,
            },
            { text: "❌ Hayır, İptal", callback_data: "manage_videos" },
          ],
        ],
      },
    };

    bot.sendMessage(
      chatId,
      `🗑️ "${videoFileName.name}" videosunu silmek istediğinizden emin misiniz?`,
      confirmOpts
    );
  }
  // Video silme onayı
  else if (data.startsWith("delete:")) {
    const shortId = data.replace("delete:", "");
    const videoFileName = userStates[chatId]?.videoMap?.[shortId];

    if (!videoFileName) {
      return bot.sendMessage(
        chatId,
        "❌ Video bulunamadı! Lütfen tekrar video listesine bakın."
      );
    }

    const videoPath = videoFileName.path;

    try {
      await fs.unlink(videoPath);
      await bot.sendMessage(chatId, "✅ Video başarıyla silindi!");
      // Video listesini tekrar göster
      await showVideoList(chatId, true);
    } catch (error) {
      console.error("Video silme hatası:", error);
      bot.sendMessage(chatId, "❌ Video silinirken bir hata oluştu!");
    }
  }
  // Video listesini göster
  else if (data === "show_videos") {
    await showVideoList(chatId, false);
  }
  // Video yönetim modunu göster
  else if (data === "manage_videos") {
    await showVideoList(chatId, true);
  }
  // Platform seçimi veya ana menüye dönüş
  else if (data === "instagram" || data === "tiktok") {
    userStates[chatId] = {
      platform: data,
      step: "waiting_url",
    };
    bot.sendMessage(chatId, `Lütfen ${data} video URL'sini gönderin:`);
  }
  // Ana menüye dönüş
  else if (data === "return_main_menu") {
    // Kullanıcı durumunu temizle
    delete userStates[chatId];

    const opts = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📥 Instagram Video İndirme", callback_data: "instagram" },
            { text: "📥 TikTok Video İndirme", callback_data: "tiktok" },
          ],
          [
            {
              text: "📂 Kayıtlı Videoları Göster",
              callback_data: "show_videos",
            },
          ],
          [{ text: "📅 Planlı Paylaşımlar", callback_data: "scheduled_posts" }],
          [
            {
              text: "🗑️ Geçmiş Mesajları Temizle",
              callback_data: "clear_messages",
            },
          ],
        ],
      },
    };

    bot.sendMessage(chatId, "Ana menüye döndünüz. Ne yapmak istersiniz?", opts);
  }
  // Mesaj temizleme işlemi
  else if (data === "clear_messages") {
    // Silme onayı için butonlar
    const confirmOpts = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ Evet, Temizle",
              callback_data: "confirm_clear_messages",
            },
            { text: "❌ Hayır, İptal", callback_data: "return_main_menu" },
          ],
        ],
      },
    };

    bot.sendMessage(
      chatId,
      "🗑️ Tüm geçmiş mesajları silmek istediğinizden emin misiniz?\n\n" +
        "⚠️ Bu işlem geri alınamaz!",
      confirmOpts
    );
  }
  // Mesaj temizleme onayı
  else if (data === "confirm_clear_messages") {
    try {
      // Son mesaj ID'sini al
      const messageId = callbackQuery.message.message_id;

      // Tüm mesajları silmeye çalış
      const deletePromises = [];
      for (let i = messageId; i >= 1; i--) {
        deletePromises.push(
          bot.deleteMessage(chatId, i).catch(() => {
            // Silinemeyen mesajları sessizce geç
          })
        );
      }

      // Tüm silme işlemlerinin tamamlanmasını bekle
      Promise.all(deletePromises).then(() => {
        // Yeni bir başlangıç mesajı gönder
        const opts = {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "📥 Instagram Video İndirme",
                  callback_data: "instagram",
                },
                { text: "📥 TikTok Video İndirme", callback_data: "tiktok" },
              ],
              [
                {
                  text: "📅 Planlı Paylaşımlar",
                  callback_data: "scheduled_posts",
                },
              ],
              [
                {
                  text: "📂 Kayıtlı Videoları Göster",
                  callback_data: "show_videos",
                },
              ],
              [
                {
                  text: "🗑️ Geçmiş Mesajları Temizle",
                  callback_data: "clear_messages",
                },
              ],
            ],
          },
        };

        bot.sendMessage(
          chatId,
          "✨ Tüm mesajlar temizlendi!\n\nNe yapmak istersiniz?",
          opts
        );
      });
    } catch (error) {
      console.error("Mesaj temizleme hatası:", error);
      bot.sendMessage(
        chatId,
        "❌ Mesajlar temizlenirken bir hata oluştu. Lütfen tekrar deneyin."
      );
    }
  }
  // Platform seçimi sonrası tarih seçimi ekle
  else if (
    data === "instagram_upload" ||
    data === "youtube_upload" ||
    data === "cross_upload"
  ) {
    try {
      if (!userStates[chatId] || !userStates[chatId].processedVideo) {
        return bot.sendMessage(
          chatId,
          "❌ Video bilgisi bulunamadı! Lütfen tekrar video seçin."
        );
      }

      const platform = data === "cross_upload" ? "both" : data.split("_")[0];
      const videoPath = userStates[chatId].processedVideo;
      const caption = userStates[chatId].videoText || "Short Video";

      const opts = {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🚀 Şimdi Paylaş",
                callback_data: `share_now:${platform}`,
              },
              { text: "📅 İleri Tarih", callback_data: `schedule:${platform}` },
            ],
            [{ text: "🏠 Ana Menü", callback_data: "return_main_menu" }],
          ],
        },
      };

      bot.sendMessage(
        chatId,
        platform === "both"
          ? "📱 Instagram ve YouTube'a ne zaman paylaşmak istersiniz?"
          : "Ne zaman paylaşmak istersiniz?",
        opts
      );
    } catch (error) {
      console.error("Platform seçim hatası:", error);
      bot.sendMessage(chatId, "❌ Bir hata oluştu. Lütfen tekrar deneyin.");
    }
  }
  // Şimdi paylaş seçeneği için handler
  else if (data.startsWith("share_now:")) {
    try {
      if (!userStates[chatId] || !userStates[chatId].processedVideo) {
        return bot.sendMessage(
          chatId,
          "❌ Video bilgisi bulunamadı! Lütfen tekrar video seçin."
        );
      }

      const platform = data.split(":")[1];
      const videoPath = userStates[chatId].processedVideo;
      const caption = userStates[chatId].videoText || "Short Video";

      // İlerleme mesajı
      const statusMessage = await bot.sendMessage(
        chatId,
        platform === "both"
          ? "🔄 Her iki platforma yükleniyor...\n\n[▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒] 0%"
          : `${
              platform === "instagram" ? "📱 Instagram" : "📺 YouTube"
            }'a yükleniyor...\n\n[▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒] 0%`
      );

      if (platform === "both") {
        try {
          // Instagram'a yükle
          await updateProgress(
            chatId,
            statusMessage.message_id,
            "📱 Instagram'a yükleniyor...",
            25
          );

          const instagramResult = await uploadReels(videoPath, caption);

          await updateProgress(
            chatId,
            statusMessage.message_id,
            "📺 YouTube'a yükleniyor...",
            75
          );

          // YouTube'a yükle
          const youtubeResult = await uploadShort(videoPath, caption);

          // Log kaydı
          await logAction({
            type: "CROSS_UPLOAD",
            status: "success",
            chatId: chatId,
            instagramUrl: instagramResult.url,
            youtubeUrl: youtubeResult.url,
          });

          // Başarılı yükleme mesajı
          await bot.editMessageText(
            `✅ Video her iki platforma başarıyla yüklendi!\n\n` +
              `📱 Instagram: ${instagramResult.url}\n` +
              `📺 YouTube: ${youtubeResult.url}\n` +
              `📝 Açıklama: ${caption}`,
            {
              chat_id: chatId,
              message_id: statusMessage.message_id,
              disable_web_page_preview: true,
            }
          );
        } catch (error) {
          console.error("Çapraz paylaşım hatası:", error);
          bot.sendMessage(
            chatId,
            `❌ Paylaşım sırasında bir hata oluştu:\n${error.message}`
          );
        }
      } else {
        try {
          const result = await (platform === "instagram"
            ? uploadReels(videoPath, caption)
            : uploadShort(videoPath, caption));

          // Log kaydı
          await logAction({
            type:
              platform === "instagram" ? "INSTAGRAM_UPLOAD" : "YOUTUBE_UPLOAD",
            status: "success",
            chatId: chatId,
            url: result.url,
          });

          // Başarılı yükleme mesajı
          await bot.editMessageText(
            `✅ Video başarıyla ${
              platform === "instagram" ? "Instagram" : "YouTube"
            }'a yüklendi!\n\n` +
              `🎥 Video URL: ${result.url}\n` +
              `📝 ${
                platform === "instagram" ? "Açıklama" : "Başlık"
              }: ${caption}`,
            {
              chat_id: chatId,
              message_id: statusMessage.message_id,
              disable_web_page_preview: true,
            }
          );
        } catch (error) {
          console.error(`${platform} yükleme hatası:`, error);
          bot.sendMessage(
            chatId,
            `❌ ${
              platform === "instagram" ? "Instagram" : "YouTube"
            } yüklemesi sırasında bir hata oluştu:\n${error.message}`
          );
        }
      }

      // Kullanıcı durumunu temizle
      delete userStates[chatId];

      // Ana menü butonu göster
      const successOpts = {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🏠 Ana Menü", callback_data: "return_main_menu" }],
          ],
        },
      };

      bot.sendMessage(
        chatId,
        "✨ İşlem tamamlandı! Ana menüye dönmek için butona tıklayabilirsiniz.",
        successOpts
      );
    } catch (error) {
      console.error("Paylaşım hatası:", error);
      bot.sendMessage(
        chatId,
        "❌ Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin."
      );
    }
  }
  // Tarih işleme kodunu düzelt
  else if (data.startsWith("schedule:")) {
    const platform = data.split(":")[1];
    userStates[chatId].schedulePlatform = platform;
    userStates[chatId].step = "waiting_schedule_date";

    bot.sendMessage(
      chatId,
      "📅 Lütfen paylaşım tarihini ve saatini aşağıdaki formatta gönderin:\n\n" +
        "GG.AA.YYYY SS:DD\n" +
        "Örnek: 01.02.2025 15:30"
    );
  }
  // Planlı paylaşımları göster
  else if (data === "scheduled_posts") {
    await showScheduledPosts(chatId);
  }
  // Planlı paylaşım iptal
  else if (data.startsWith("scheduled:")) {
    const postId = data.split(":")[1];
    const post = scheduledPosts[chatId]?.[postId];

    if (!post) {
      return bot.sendMessage(chatId, "❌ Paylaşım bulunamadı!");
    }

    const opts = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Evet, İptal Et", callback_data: `cancel:${postId}` },
            { text: "❌ Hayır", callback_data: "scheduled_posts" },
          ],
        ],
      },
    };

    const platform = post.platform === "instagram" ? "Instagram" : "YouTube";
    const date = formatDate(new Date(post.scheduledDate));

    bot.sendMessage(
      chatId,
      `🗑️ Bu planlı paylaşımı iptal etmek istediğinizden emin misiniz?\n\n` +
        `Platform: ${platform}\n` +
        `Tarih: ${date}\n` +
        `Açıklama: ${post.caption}`,
      opts
    );
  }
  // Tüm planlı paylaşımları iptal et
  else if (data === "cancel_all_scheduled") {
    const opts = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ Evet, Hepsini İptal Et",
              callback_data: "confirm_cancel_all",
            },
            { text: "❌ Hayır", callback_data: "scheduled_posts" },
          ],
        ],
      },
    };

    bot.sendMessage(
      chatId,
      "⚠️ Tüm planlı paylaşımları iptal etmek istediğinizden emin misiniz?",
      opts
    );
  }
  // Ayarlar işlemleri
  else if (data === "edit_watermark") {
    userStates[chatId] = {
      step: "waiting_watermark",
    };
    bot.sendMessage(
      chatId,
      "✏️ Videolara eklenecek marka yazısını gönderin.\n" +
        "İptal etmek için 'iptal' yazın."
    );
  }
});

// URL ve metin işleme
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!userStates[chatId]) return;

  if (userStates[chatId].step === "waiting_url") {
    userStates[chatId].videoURL = text;
    userStates[chatId].step = "waiting_text";
    bot.sendMessage(chatId, "Video üzerine eklenecek metni gönderin:");
    return;
  }

  if (userStates[chatId].step === "waiting_text") {
    try {
      await logAction({
        type: "VIDEO_DOWNLOAD_START",
        status: "info",
        chatId: chatId,
        platform: userStates[chatId].platform,
        url: userStates[chatId].videoURL,
      });

      // İlerleme mesajı gönder
      const statusMessage = await bot.sendMessage(
        chatId,
        "Video işleniyor...\n\n[▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒] 0%"
      );

      // Dosya adları oluştur
      const timestamp = Date.now();
      const formattedText = formatFileName(text);
      const videoFileName = `${userStates[chatId].platform}_${formattedText}_${timestamp}.mp4`;
      const outputFileName = `masked_${videoFileName}`;

      const videoPath = path.join(TEMP_DIR, videoFileName);

      // Videoyu indir
      await updateProgress(
        chatId,
        statusMessage.message_id,
        "📥 Video indiriliyor...",
        0
      );

      if (userStates[chatId].platform === "tiktok") {
        await indirTiktokVideo(
          userStates[chatId].videoURL,
          videoPath,
          async (progress) => {
            await updateProgress(
              chatId,
              statusMessage.message_id,
              "📥 Video indiriliyor...",
              progress
            );
          }
        );
      } else {
        await indirInstagramVideo(
          userStates[chatId].videoURL,
          videoPath,
          async (progress) => {
            await updateProgress(
              chatId,
              statusMessage.message_id,
              "📥 Video indiriliyor...",
              progress
            );
          }
        );
      }

      // Video işleme
      await updateProgress(
        chatId,
        statusMessage.message_id,
        "🎬 Video işleniyor...",
        0
      );
      const tempOutputPath = path.join(TEMP_DIR, `temp_${outputFileName}`);
      await maskVideo(videoPath, tempOutputPath, text, async (progress) => {
        await updateProgress(
          chatId,
          statusMessage.message_id,
          "🎬 Video işleniyor...",
          progress
        );
      });

      // İşlenmiş videoyu kategoriye göre kaydet
      await updateProgress(
        chatId,
        statusMessage.message_id,
        "💾 Video kaydediliyor...",
        90
      );
      const finalOutputPath = await saveVideo(
        tempOutputPath,
        outputFileName,
        text
      );

      // Geçici dosyaları temizle
      await fs.unlink(videoPath);
      await fs.unlink(tempOutputPath);

      // Platform seçim butonlarını göster
      const opts = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "📱 Instagram Reels", callback_data: "instagram_upload" },
              { text: "📺 YouTube Shorts", callback_data: "youtube_upload" },
              { text: "🔄 Çapraz Paylaşım", callback_data: "cross_upload" },
            ],
            [{ text: "🏠 Ana Menü", callback_data: "return_main_menu" }],
          ],
        },
      };

      await bot.editMessageText(
        "✨ Video başarıyla hazırlandı! Nereye yüklemek istersiniz?",
        {
          chat_id: chatId,
          message_id: statusMessage.message_id,
          reply_markup: opts.reply_markup,
        }
      );

      // Kullanıcı durumunu güncelle
      userStates[chatId] = {
        processedVideo: finalOutputPath,
        videoText: text,
        step: "waiting_platform",
      };

      await logAction({
        type: "VIDEO_DOWNLOAD_COMPLETE",
        status: "success",
        chatId: chatId,
        platform: userStates[chatId].platform,
        fileName: videoFileName,
      });
    } catch (error) {
      await logAction({
        type: "VIDEO_DOWNLOAD_ERROR",
        status: "error",
        chatId: chatId,
        platform: userStates[chatId].platform,
        error: error.message,
      });

      console.error("Video işleme hatası:", error);
      bot.sendMessage(
        chatId,
        "Üzgünüm, video işlenirken bir hata oluştu. Lütfen tekrar deneyin."
      );
      delete userStates[chatId];
    }
  }

  // Tarih işleme kodunu düzelt
  if (userStates[chatId]?.step === "waiting_schedule_date") {
    try {
      const [datePart, timePart] = text.split(" ");
      const [day, month, year] = datePart.split(".");
      const [hours, minutes] = timePart.split(":");

      const scheduledDate = new Date();
      scheduledDate.setFullYear(parseInt(year));
      scheduledDate.setMonth(parseInt(month) - 1);
      scheduledDate.setDate(parseInt(day));
      scheduledDate.setHours(parseInt(hours));
      scheduledDate.setMinutes(parseInt(minutes));
      scheduledDate.setSeconds(0);
      scheduledDate.setMilliseconds(0);

      if (scheduledDate <= new Date()) {
        return bot.sendMessage(
          chatId,
          "❌ Geçmiş bir tarih seçemezsiniz! Lütfen gelecek bir tarih girin."
        );
      }

      // scheduled.json dosyasını oku
      let scheduledData = { posts: {} };
      try {
        const content = await fs.readFile(SCHEDULED_FILE, "utf8");
        scheduledData = JSON.parse(content);
      } catch (error) {
        // Dosya yoksa yeni oluştur
        await fs.writeFile(
          SCHEDULED_FILE,
          JSON.stringify(scheduledData, null, 2)
        );
      }

      // Yeni paylaşımları ekle
      if (!scheduledData.posts[chatId]) {
        scheduledData.posts[chatId] = {};
      }

      if (userStates[chatId].schedulePlatform === "both") {
        // Instagram için paylaşım
        const instaPostId = `post_${Date.now()}_instagram`;
        scheduledData.posts[chatId][instaPostId] = {
          id: instaPostId,
          platform: "instagram",
          videoPath: userStates[chatId].processedVideo,
          caption: userStates[chatId].videoText,
          scheduledDate: scheduledDate.toISOString(),
        };

        // YouTube için paylaşım
        const youtubePostId = `post_${Date.now()}_youtube`;
        scheduledData.posts[chatId][youtubePostId] = {
          id: youtubePostId,
          platform: "youtube",
          videoPath: userStates[chatId].processedVideo,
          caption: userStates[chatId].videoText,
          scheduledDate: scheduledDate.toISOString(),
        };

        // Log kaydı al
        await logAction({
          type: "CROSS_POST_SCHEDULED",
          status: "success",
          chatId: chatId,
          instagramPostId: instaPostId,
          youtubePostId: youtubePostId,
          scheduledDate: scheduledDate.toISOString(),
        });

        bot.sendMessage(
          chatId,
          `✅ Çapraz paylaşım planlandı!\n\n` +
            `Platformlar: Instagram ve YouTube\n` +
            `Tarih: ${formatDate(scheduledDate)}\n` +
            `Açıklama: ${userStates[chatId].videoText}`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "📅 Planlı Paylaşımlar",
                    callback_data: "scheduled_posts",
                  },
                  { text: "🏠 Ana Menü", callback_data: "return_main_menu" },
                ],
              ],
            },
          }
        );
      } else {
        // Tek platform için paylaşım
        const postId = `post_${Date.now()}`;
        scheduledData.posts[chatId][postId] = {
          id: postId,
          platform: userStates[chatId].schedulePlatform,
          videoPath: userStates[chatId].processedVideo,
          caption: userStates[chatId].videoText,
          scheduledDate: scheduledDate.toISOString(),
        };

        // Log kaydı al
        await logAction({
          type: "POST_SCHEDULED",
          status: "success",
          chatId: chatId,
          postId: postId,
          platform: userStates[chatId].schedulePlatform,
          scheduledDate: scheduledDate.toISOString(),
        });

        const platformName =
          userStates[chatId].schedulePlatform === "instagram"
            ? "Instagram"
            : "YouTube";

        bot.sendMessage(
          chatId,
          `✅ Paylaşım planlandı!\n\n` +
            `Platform: ${platformName}\n` +
            `Tarih: ${formatDate(scheduledDate)}\n` +
            `Açıklama: ${userStates[chatId].videoText}`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "📅 Planlı Paylaşımlar",
                    callback_data: "scheduled_posts",
                  },
                  { text: "🏠 Ana Menü", callback_data: "return_main_menu" },
                ],
              ],
            },
          }
        );
      }

      // Değişiklikleri kaydet
      await fs.writeFile(
        SCHEDULED_FILE,
        JSON.stringify(scheduledData, null, 2)
      );

      // En son kullanıcı durumunu temizle
      delete userStates[chatId];
    } catch (error) {
      console.error("Tarih işleme hatası:", error);
      await logAction({
        type: "POST_SCHEDULE_ERROR",
        status: "error",
        chatId: chatId,
        error: error.message,
      });

      bot.sendMessage(
        chatId,
        "❌ Geçersiz tarih formatı! Lütfen GG.AA.YYYY SS:DD formatında girin.\n" +
          "Örnek: 25.02.2024 15:30"
      );
    }
  }

  // Ayar işlemleri
  if (userStates[chatId]?.step === "waiting_users") {
    if (text.toLowerCase() === "iptal") {
      delete userStates[chatId];
      return bot.sendMessage(chatId, "❌ İşlem iptal edildi.", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "⚙️ Ayarlara Dön", callback_data: "settings" }],
          ],
        },
      });
    }

    try {
      if (text.trim() === "") {
        config.bot.allowedUsers = [];
      } else {
        const users = text.split(",").map((id) => parseInt(id.trim()));
        if (users.some((id) => isNaN(id))) {
          throw new Error("Geçersiz ID formatı");
        }
        config.bot.allowedUsers = users;
      }

      delete userStates[chatId];
      await saveConfig();
      bot.sendMessage(chatId, "✅ Yetkili kullanıcılar güncellendi!", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "⚙️ Ayarlara Dön", callback_data: "settings" }],
          ],
        },
      });
    } catch (error) {
      bot.sendMessage(
        chatId,
        "❌ Geçersiz format! Lütfen sayıları virgülle ayırarak gönderin."
      );
    }
  } else if (userStates[chatId]?.step === "waiting_watermark") {
    if (text.toLowerCase() === "iptal") {
      delete userStates[chatId];
      return bot.sendMessage(chatId, "❌ İşlem iptal edildi.", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "⚙️ Ayarlara Dön", callback_data: "settings" }],
          ],
        },
      });
    }

    config.bot.watermark = text.trim();
    await saveConfig();
    delete userStates[chatId];
    bot.sendMessage(chatId, "✅ Marka yazısı güncellendi!", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "⚙️ Ayarlara Dön", callback_data: "settings" }],
        ],
      },
    });
  }
});

// Hata yakalama
bot.on("polling_error", (error) => {
  console.error("Bot hatası:", error);
});

// Botun başlatılması
setupDirs()
  .then(async () => {
    scheduledPosts = await loadScheduledPosts();
    console.log("🤖 Bot başlatıldı!");
    await logAction({
      type: "BOT_START",
      status: "success",
      message: "Bot başarıyla başlatıldı",
    });
  })
  .catch(console.error);

// Video kaydetme işlemi
async function saveVideo(inputPath, outputFileName, title) {
  try {
    const outputPath = path.join(VIDEOS_DIR, outputFileName);
    await fs.copyFile(inputPath, outputPath);

    // Video kayıtlarını yükle
    const videosData = await loadVideos();
    const videoId = `vid_${Date.now()}`;

    // Yeni videoyu ekle
    videosData.videos[videoId] = {
      id: videoId,
      title: title,
      path: outputPath,
      fileName: outputFileName,
      createdAt: new Date().toISOString(),
      platforms: [], // Paylaşıldığı platformlar
    };

    // Kayıtları kaydet
    await saveVideos(videosData);

    return outputPath;
  } catch (error) {
    console.error("Video kaydetme hatası:", error);
    throw error;
  }
}

// Platform paylaşımını kaydet
async function updateVideoPlatform(videoId, platform) {
  try {
    const videosData = await loadVideos();
    if (videosData.videos[videoId]) {
      if (!videosData.videos[videoId].platforms) {
        videosData.videos[videoId].platforms = [];
      }
      if (!videosData.videos[videoId].platforms.includes(platform)) {
        videosData.videos[videoId].platforms.push(platform);
        await saveVideos(videosData);
      }
    }
  } catch (error) {
    console.error("Platform güncelleme hatası:", error);
  }
}

// Loglama fonksiyonu
async function logAction(action) {
  try {
    const now = new Date();
    const logDate = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const logTime = now.toISOString().split("T")[1].split(".")[0]; // HH:mm:ss
    const logFile = path.join(LOG_DIR, `${logDate}.json`);

    // Mevcut logları oku veya yeni dosya oluştur
    let logs = [];
    try {
      const content = await fs.readFile(logFile, "utf8");
      logs = JSON.parse(content);
    } catch (error) {
      // Dosya yoksa boş array ile devam et
    }

    // Yeni log ekle
    logs.push({
      timestamp: `${logDate} ${logTime}`,
      ...action,
    });

    // Logları kaydet
    await fs.writeFile(logFile, JSON.stringify(logs, null, 2));
  } catch (error) {
    console.error("Loglama hatası:", error);
  }
}
