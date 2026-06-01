/**
 * 热梗雷达 - Web 服务
 */
import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { config } from "./src/config.js";
import { fetchAll, mergeAcrossPlatforms } from "./src/scrapers.js";
import { fetchAggregatedTrends } from "./src/aggregation.js";
import { summarize, buildBasicReport } from "./src/summarizer.js";
import { getAllFeedback, addFeedback, replyFeedback, toggleLike } from "./src/feedback.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(join(__dirname, "public")));

// ═══════════════════════════════════════
//  抓取 API
// ═══════════════════════════════════════
app.post("/api/run", async (req, res) => {
  const t0 = Date.now();
  try {
    const { results: rawData, errors } = await fetchAll();
    const total = Object.values(rawData).reduce((s, v) => s + v.length, 0);
    if (total === 0) return res.json({ error: "所有平台均获取失败" });

    let mergedData = [];
    try { mergedData = mergeAcrossPlatforms(rawData); } catch {}

    let aggregatedData = [];
    try { aggregatedData = await fetchAggregatedTrends(); } catch {}

    let summary = null;
    if (config.ai.apiKey) {
      try { summary = await summarize(rawData, mergedData, aggregatedData); } catch {}
    }
    if (!summary) summary = buildBasicReport(rawData, mergedData);

    // 匹配链接+热度值
    const allRaw = [];
    for (const [src, items] of Object.entries(rawData)) {
      for (const it of items) {
        if (it.title) allRaw.push({ title: it.title, url: it.url || "", src, heat: it.heat || "" });
      }
    }
    const trends = summary?.top30 || summary?.categories?.[0]?.trends || [];
    for (const t of trends) {
      const matched = allRaw.filter((r) => titleMatch(t.title, r.title));
      t.urls = matched.filter((m) => m.url).map((m) => ({ platform: m.src, url: m.url }));
      const hm = {};
      for (const m of matched) if (m.heat && !hm[m.src]) hm[m.src] = m.heat;
      t.heat_values = hm;
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    res.json({
      success: true, elapsed: elapsed + "s", date: summary?.date,
      stats: { raw: total, merged: mergedData.length, filtered: trends.length, platforms: Object.keys(rawData).filter((k) => rawData[k]?.length).length },
      summary: summary?.summary || "", trends,
      crossPlatform: mergedData.filter((m) => m.platformCount > 1).length,
    });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// ═══════════════════════════════════════
//  反馈 API
// ═══════════════════════════════════════
app.get("/api/feedback", (req, res) => {
  res.json({ feedback: getAllFeedback() });
});

app.post("/api/feedback", (req, res) => {
  res.json(addFeedback(req.body));
});

app.post("/api/feedback/reply", (req, res) => {
  res.json(replyFeedback(req.body));
});

app.post("/api/feedback/like", (req, res) => {
  res.json(toggleLike({ id: req.body.id, fingerprint: req.body.fingerprint || req.ip }));
});

// ═══════════════════════════════════════
//  工具函数
// ═══════════════════════════════════════
function titleMatch(a, b) {
  if (!a || !b) return false;
  const c = (s) => s.replace(/[\s\u3000,.，。！？、；：""''【】《》（）()~～#【】「」『』·]/g, "");
  const ca = c(a), cb = c(b);
  if (ca === cb || ca.includes(cb) || cb.includes(ca)) return true;
  const sA = new Set(ca), sB = new Set(cb);
  let n = 0;
  for (const ch of sA) if (sB.has(ch)) n++;
  const ml = Math.min([...sA].length, [...sB].length);
  return ml >= 4 && n / ml >= 0.6;
}

// ═══════════════════════════════════════
//  启动
// ═══════════════════════════════════════
app.listen(PORT, () => {
  console.log(`\n📡 热梗雷达 Web 版已启动: http://localhost:${PORT}`);
  console.log(`🤖 AI: ${config.ai.apiKey ? "已配置" : "未配置"}\n`);
});
