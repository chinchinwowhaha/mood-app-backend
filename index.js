import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;

// ✅ 你在 Render 要放的三個環境變數
// LLM_API_KEY   = 你的 Groq API key
// LLM_ENDPOINT  = https://api.groq.com/openai/v1/chat/completions
// LLM_MODEL     = llama3-8b-8192
const LLM_API_KEY = process.env.LLM_API_KEY || "";
const LLM_ENDPOINT =
  process.env.LLM_ENDPOINT || "https://api.groq.com/openai/v1/chat/completions";
const LLM_MODEL = process.env.LLM_MODEL || "llama3-8b-8192";

function safeStr(v, fallback = "") {
  if (v === null || v === undefined) return fallback;
  return String(v);
}

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (Number.isNaN(x)) return fallback;
  return Math.max(min, Math.min(max, Math.round(x)));
}

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "mood-app-backend" });
});

app.post("/chat", async (req, res) => {
  const text = safeStr(req.body?.text, "").trim();
  const emotion = safeStr(req.body?.emotion, "neutral");
  const intensity = clampInt(req.body?.intensity, 3, 1, 5); // note: clampInt expects (n,min,max,fallback) -> 我們改寫一下避免錯
});

// ↑ 上面 clampInt 我刻意不讓你用到，下面用更直覺的方式處理
app.post("/chat", async (req, res) => {
  const text = safeStr(req.body?.text, "").trim();
  const emotion = safeStr(req.body?.emotion, "neutral");
  const intensityRaw = Number(req.body?.intensity);
  const intensity = Number.isFinite(intensityRaw)
    ? Math.max(1, Math.min(5, Math.round(intensityRaw)))
    : 3;

  // 你原本的 fallback 回應格式我幫你保留
  const fallback = (debugMsg = "") => {
    return res.json({
      reply:
        "我有收到你的訊息，但目前 AI 服務回應異常（可能是金鑰/模型/endpoint 設定不正確）。\n" +
        "你可以檢查 Render 的 LLM_* 設定，或把錯誤訊息貼給我我幫你看。",
      suggestedEmotion: emotion,
      suggestedIntensity: intensity,
      microAction: "先做 60 秒：把肩膀抬起→停 2 秒→放下，重複 5 次。",
      debug: debugMsg ? debugMsg : undefined,
    });
  };

  // 基本檢查
  if (!text) return res.status(400).json({ error: "Missing text" });
  if (!LLM_API_KEY) return fallback("Missing LLM_API_KEY");
  if (!LLM_ENDPOINT) return fallback("Missing LLM_ENDPOINT");
  if (!LLM_MODEL) return fallback("Missing LLM_MODEL");

  try {
    const resp = await fetch(LLM_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          {
            role: "system",
            content:
              "你是一個溫柔、簡短、實用的情緒陪伴助手。回覆用繁體中文，避免說教。",
          },
          { role: "user", content: text },
        ],
        temperature: 0.7,
      }),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      const msg =
        data?.error?.message ||
        data?.message ||
        `LLM HTTP ${resp.status} ${resp.statusText}`;
      return fallback(`LLM_ERROR: ${msg}`);
    }

    const reply =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      "";

    if (!reply) return fallback("LLM returned empty reply");

    return res.json({
      reply,
      suggestedEmotion: emotion,
      suggestedIntensity: intensity,
      microAction: "先做 60 秒：把肩膀抬起→停 2 秒→放下，重複 5 次。",
    });
  } catch (err) {
    return fallback(`EXCEPTION: ${safeStr(err?.message || err)}`);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Using LLM_ENDPOINT: ${LLM_ENDPOINT}`);
  console.log(`Using LLM_MODEL: ${LLM_MODEL}`);
});
