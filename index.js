import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;

/* ========= 基本風險關鍵字判斷 ========= */
function isHighRisk(text = "") {
  const t = String(text).toLowerCase();
  const keywords = [
    "想死",
    "自殺",
    "自殘",
    "活不下去",
    "結束生命",
    "不想活",
    "傷害自己",
    "kill myself",
    "suicide",
    "self harm",
  ];
  return keywords.some(k => t.includes(k));
}

/* ========= 主聊天 API ========= */
app.post("/chat", async (req, res) => {
  const { text = "", emotion = "neutral", intensity = 1 } = req.body;

  if (!text) {
    return res.status(400).json({ error: "text is required" });
  }

  // 高風險直接回應（不呼叫 LLM）
  if (isHighRisk(text)) {
    return res.json({
      reply:
        "我聽到你真的很痛苦，這不是你一個人該承受的事。你值得被認真傾聽與幫助。如果你在台灣，可以撥打 1925（生命線）或 1980（安心專線）；如果不在台灣，請告訴我你所在的地區，我可以幫你找資源。",
      suggestedEmotion: "sad",
      suggestedIntensity: 5,
      microAction: "請先深呼吸 10 秒，然後試著把你的感受寫下來"
    });
  }

  try {
    const response = await fetch(process.env.LLM_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL,
        messages: [
          {
            role: "system",
            content:
              "你是一位溫柔、理性、陪伴型的情緒支持助理，避免說教，不下診斷，只提供理解與具體的小行動建議。",
          },
          {
            role: "user",
            content: `使用者情緒：${emotion}（強度 ${intensity}/5）\n使用者說：${text}`,
          },
        ],
        temperature: 0.7,
      }),
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("LLM API error:", data);
      return res.json({
        reply:
          "我有收到你的訊息，但目前 AI 回應服務暫時無法使用。你願意多跟我說一點現在的感受嗎？",
        suggestedEmotion: emotion,
        suggestedIntensity: intensity,
        microAction: "先喝一口水，讓身體放鬆一下",
      });
    }

    const reply =
      data?.choices?.[0]?.message?.content ||
      "我在這裡，願意聽你說。";

    res.json({
      reply,
      suggestedEmotion: emotion,
      suggestedIntensity: intensity,
      microAction: "閉上眼睛 10 秒，感受一下呼吸",
    });
  } catch (err) {
    console.error("Server error:", err);
    res.json({
      reply:
        "我現在有點忙，但我沒有忽略你。你願意再試著說一次嗎？",
      suggestedEmotion: emotion,
      suggestedIntensity: intensity,
      microAction: "慢慢吸氣 4 秒，再吐氣 6 秒",
    });
  }
});

/* ========= 健康檢查 ========= */
app.get("/", (req, res) => {
  res.send("Mood app backend is running.");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
