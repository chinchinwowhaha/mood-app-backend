import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;

/** 基本高風險字詞偵測（示範用，之後可再精緻化） */
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
  return keywords.some((k) => t.includes(k));
}

/** 把模型回覆盡量解析成 JSON（容錯） */
function safeParseAssistantJson(maybeText, fallback) {
  try {
    const s = String(maybeText ?? "");
    const match = s.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const obj = JSON.parse(match[0]);
    if (!obj || typeof obj.reply !== "string") return fallback;
    return obj;
  } catch {
    return fallback;
  }
}

/** 呼叫 LLM：如果環境變數沒設好，就回「尚未設定」而不是讓程式掛掉 */
async function callLLM({ userText, emotion, intensity }) {
  const endpoint = process.env.LLM_ENDPOINT;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;

  // ✅ 沒設定也不要 throw，避免 Render 直接掛掉
  if (!endpoint || !apiKey || !model) {
    return {
      reply:
        "後端已經上線 ✅ 但 AI 服務尚未設定（缺少 LLM_ENDPOINT / LLM_API_KEY / LLM_MODEL）。\n請到 Render 的 Environment 加上這三個值後再試一次。",
      suggestedEmotion: emotion || "neutral",
      suggestedIntensity: Number(intensity) || 3,
      microAction: "先做 30 秒：吸氣 4 秒、吐氣 6 秒，重複 3 次。",
    };
  }

  const systemPrompt = `
你是溫柔、可靠的情緒陪伴者（不是心理師、不是醫療）。
請依序做到：
1) 共感一句（不評價、不說教）
2) 提 1–2 個溫柔的引導式問題
3) 給 1 個 30–90 秒可完成的微行動
輸出格式必須是 JSON：
{"reply":"...", "suggestedEmotion":"...", "suggestedIntensity":3, "microAction":"..."}
`.trim();

  // 這裡沿用你先前的通用格式（endpoint 由環境變數決定）
  const body = {
    model,
    input: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `使用者文字：${userText}\n情緒：${emotion}，強度：${intensity}`,
      },
    ],
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    // ✅ 不要讓程式掛掉，回一個可理解的錯誤給前端
    return {
      reply:
        "我有收到你的訊息，但目前 AI 服務回應異常（可能是金鑰/模型/endpoint 設定不正確）。\n你可以把 Render 的 LLM_* 設定截圖給我，我幫你對。",
      suggestedEmotion: emotion || "neutral",
      suggestedIntensity: Number(intensity) || 3,
      microAction: "先做 60 秒：把肩膀抬起、停 2 秒、放下，重複 5 次。",
      debug: `LLM HTTP ${res.status}: ${text}`.slice(0, 800),
    };
  }

  const data = await res.json();

  // 不同供應商回傳格式不同，這裡做容錯
  const raw =
    data.output_text ??
    data.text ??
    (typeof data === "string" ? data : JSON.stringify(data));

  const fallback = {
    reply: "我有聽到你現在的感受，我們可以慢慢一起整理。你願意說說最卡住的點是什麼嗎？",
    suggestedEmotion: emotion || "neutral",
    suggestedIntensity: Number(intensity) || 3,
    microAction: "先做 30 秒：把注意力放在腳底與地面的接觸，慢慢呼吸。",
  };

  return safeParseAssistantJson(raw, fallback);
}

/** 健康檢查：Render 會用它判斷服務是否活著 */
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/** App 主要呼叫接口 */
app.post("/chat", async (req, res) => {
  try {
    const { text, emotion, intensity } = req.body || {};

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing text (string)" });
    }

    if (isHighRisk(text)) {
      return res.json({
        reply:
          "我很在意你的安全。如果你此刻有傷害自己的衝動，請優先聯絡身邊可信任的人，或使用當地緊急求助資源。你也可以先告訴我：你現在身邊有人可以陪你嗎？",
        suggestedEmotion: "crisis",
        suggestedIntensity: 5,
        microAction: "先把周遭可能造成傷害的物品移遠，並嘗試聯絡可信任的人或當地緊急電話。",
      });
    }

    const result = await callLLM({
      userText: text,
      emotion: emotion || "neutral",
      intensity: Number(intensity) || 3,
    });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
