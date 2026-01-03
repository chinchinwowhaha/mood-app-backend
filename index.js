import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;

// 🔒 簡單的高風險字詞偵測（心理健康必備）
function isHighRisk(text = "") {
  const t = text.toLowerCase();
  const keywords = [
    "想死", "自殺", "自殘", "活不下去", "結束生命", "不想活", "傷害自己",
    "kill myself", "suicide", "self harm"
  ];
  return keywords.some(k => t.includes(k));
}

// 🤖 呼叫 AI（之後用環境變數指定）
async function callLLM({ userText, emotion, intensity }) {
  const endpoint = process.env.LLM_ENDPOINT;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;

  if (!endpoint || !apiKey || !model) {
    throw new Error("Missing LLM env vars");
  }

  const systemPrompt = `
你是溫柔、可靠的情緒陪伴者（不是心理師、不是醫療）。
請依序做到：
1) 共感一句（不評價）
2) 提 1–2 個溫柔的引導式問題
3) 給 1 個 30–90 秒可完成的微行動
輸出格式必須是 JSON：
{"reply":"...", "suggestedEmotion":"...", "suggestedIntensity":3, "microAction":"..."}
`.trim();

  const body = {
    model,
    input: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `使用者文字：${userText}\n情緒：${emotion}，強度：${intensity}`
      }
    ]
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  const data = await res.json();

  const raw =
    data.output_text ||
    data.text ||
    JSON.stringify(data);

  let parsed;
  try {
    parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);
  } catch {
    parsed = {
      reply: "我有聽到你現在的感受，我們可以慢慢一起整理。",
      suggestedEmotion: emotion || "neutral",
      suggestedIntensity: intensity || 3,
      microAction: "先深呼吸 3 次，感受身體與椅子的接觸。"
    };
  }

  return parsed;
}

// 📩 App 會呼叫這個 API
app.post("/chat", async (req, res) => {
  try {
    const { text, emotion, intensity } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: "Missing text" });
    }

    if (isHighRisk(text)) {
      return res.json({
        reply: "我很在意你的安全，如果你正在感到危險，請立刻聯絡身邊的人或當地緊急資源。",
        suggestedEmotion: "crisis",
        suggestedIntensity: 5,
        microAction: "請先把身邊可能造成傷害的物品移遠，並嘗試聯絡可信任的人。"
      });
    }

    const result = await callLLM({
      userText: text,
      emotion,
      intensity
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🩺 Render 用來測試服務是否活著
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.l
