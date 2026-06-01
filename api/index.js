/**
 * Vercel Serverless Function - 热梗雷达 API
 */
import express from "express";
import { config } from "../src/config.js";
import { fetchAll, mergeAcrossPlatforms } from "../src/scrapers.js";
import { fetchAggregatedTrends } from "../src/aggregation.js";
import { summarize, buildBasicReport } from "../src/summarizer.js";
import { getAllFeedback, addFeedback, replyFeedback, toggleLike } from "../src/feedback-supabase.js";

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  next();
});

app.post("/api/run", async (req, res) => {
  const t0 = Date.now();
  try {
    const { results: rawData } = await fetchAll();
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

app.get("/api/feedback", async (req, res) => {
  const result = await getAllFeedback();
  res.json({ feedback: result.items || [], debug: { supabaseUrl: process.env.SUPABASE_URL ? "✅" : "❌", error: result.error || null } });
});

app.post("/api/feedback", async (req, res) => {
  const result = await addFeedback(req.body);
  res.json({ ...result, debug: { supabaseUrl: process.env.SUPABASE_URL ? "✅" : "❌" } });
});

app.post("/api/feedback/reply", async (req, res) => {
  const result = await replyFeedback(req.body);
  res.json(result);
});

app.post("/api/feedback/like", async (req, res) => {
  const fp = req.body.fingerprint || req.ip;
  const result = await toggleLike({ id: req.body.id, fingerprint: fp });
  res.json(result);
});

app.get("/api/debug", async (req, res) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  const debug = { url: url ? "✅" : "❌", key: key ? "✅" : "❌" };
  if (url && key) {
    try {
      const resp = await fetch(`${url}/rest/v1/feedback?select=*&limit=5`, {
        headers: { "apikey": key, "Authorization": `Bearer ${key}` },
      });
      debug.httpStatus = resp.status;
      const data = await resp.json();
      debug.data = data;
      debug.dataCount = Array.isArray(data) ? data.length : 0;
    } catch (e) { debug.fetchError = e.message; }
  }
  res.json(debug);
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

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

export default app;
