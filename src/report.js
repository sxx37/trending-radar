/**
 * HTML 报告生成器
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { config } from "./config.js";

const PLATFORM_META = {
  weibo:      { name: "微博热搜", icon: "🔥", color: "#ff4d4f" },
  bilibili:   { name: "B站热榜",  icon: "📺", color: "#00a1d6" },
  baidu:      { name: "百度热搜", icon: "🔍", color: "#306cff" },
  douyin:     { name: "抖音热榜", icon: "🎵", color: "#fe2c55" },
  xiaohongshu:{ name: "小红书",   icon: "📕", color: "#ff2442" },
};

function esc(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function generateHtml(rawData, summary, errors) {
  const dateStr = summary?.date || new Date().toISOString().slice(0, 10);
  const total = Object.values(rawData).reduce((s, v) => s + v.length, 0);
  const sourcesOk = Object.keys(rawData).filter((k) => rawData[k]?.length);
  const sourcesFail = Object.keys(errors || {});

  // ── 概览卡片 ──
  const overviewCards = sourcesOk
    .map((src) => {
      const m = PLATFORM_META[src] || { name: src, icon: "📋", color: "#666" };
      const count = rawData[src].length;
      return `
        <div class="overview-card">
          <span class="platform-icon">${m.icon}</span>
          <span class="platform-name">${m.name}</span>
          <span class="platform-count">${count} 条</span>
        </div>`;
    })
    .join("");

  // ── AI 总结 ──
  const aiSummarySection = summary?.summary
    ? `
    <div class="ai-summary">
      <div class="ai-badge">🤖 AI 分析</div>
      <p>${esc(summary.summary)}</p>
    </div>`
    : "";

  // ── 分类内容（热梗卡片） ──
  const categoriesHtml = (summary?.categories || [])
    .map((cat) => {
      const trendsHtml = (cat.trends || [])
        .map((t) => {
          // 平台标签：支持 key("weibo")和中文名("微博")两种格式
          const platforms = (t.platforms || [])
            .map((p) => {
              const m = PLATFORM_META[p] || Object.values(PLATFORM_META).find(v => v.name === p);
              const color = m?.color || "#666";
              const name = m?.name || p;
              return `<span class="platform-tag" style="background:${color}15;color:${color}">${name}</span>`;
            })
            .join("");
          // 热度等级 emoji
          const heatLevel = t.heat_level || "";
          const rankNum = t.rank || "";
          const usageHtml = t.usage
            ? `<div class="trend-usage">💡 <strong>创作灵感：</strong>${esc(t.usage)}</div>`
            : "";
          const whyHtml = t.why_hot
            ? `<div class="trend-why">📢 ${esc(t.why_hot)}</div>`
            : "";
          // 标题链接：优先用匹配到的原始链接，多平台时展示为可点击的平台标签
          const titleLinks = (t.urls || []).map((u) => {
            const m = PLATFORM_META[u.platform] || { name: u.platform, color: "#666" };
            return `<a href="${esc(u.url)}" target="_blank" class="title-link" style="background:${m.color}12;color:${m.color}" title="在${m.name}查看">↗ ${m.name}</a>`;
          }).join("");
          const titleHtml = (t.urls && t.urls.length)
            ? `<div class="trend-title"><a href="${esc(t.urls[0].url)}" target="_blank">${esc(t.title)}</a>${titleLinks}</div>`
            : `<div class="trend-title">${esc(t.title)}</div>`;
          return `
          <div class="trend-card">
            <div class="trend-header">
              <span class="trend-rank">#${rankNum}</span>
              ${titleHtml}
              <span class="trend-heat">${heatLevel}</span>
            </div>
            <div class="trend-platforms">${platforms}</div>
            <div class="trend-desc">${esc(t.description)}</div>
            ${whyHtml}
            ${usageHtml}
          </div>`;
        })
        .join("");
      return `
      <div class="category-section">
        <h2 class="category-title">${esc(cat.name)}</h2>
        ${trendsHtml}
      </div>`;
    })
    .join("");

  // ── 原始榜单 ──
  const rawSections = sourcesOk
    .map((src) => {
      const m = PLATFORM_META[src] || { name: src, icon: "📋", color: "#666" };
      const items = rawData[src];
      const rows = items
        .slice(0, 30)
        .map((it) => {
          const heatBadge = it.heat
            ? `<span class="heat-badge">${esc(it.heat)}</span>`
            : "";
          const titleText = it.url
            ? `<a href="${esc(it.url)}" target="_blank">${esc(it.title)}</a>`
            : esc(it.title);
          return `
          <tr>
            <td class="rank-cell">${it.rank || ""}</td>
            <td class="title-cell">${titleText}</td>
            <td class="heat-cell">${heatBadge}</td>
          </tr>`;
        })
        .join("");
      return `
      <details class="platform-section">
        <summary>
          <span style="color:${m.color}">${m.icon}</span>
          ${m.name}
          <span class="count-badge">${items.length} 条</span>
        </summary>
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>话题</th><th>热度</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </details>`;
    })
    .join("");

  // ── 错误提示 ──
  const errorsHtml = sourcesFail.length
    ? `<div class="error-notice">
    ⚠️ 以下平台数据获取失败: ${sourcesFail.map((s) => PLATFORM_META[s]?.name || s).join("、")}<br>
    可能是网络问题或接口变动，下次运行时会自动重试。
  </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>热梗雷达 - ${dateStr}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  background:#f5f7fa;color:#333;line-height:1.6;
}
.header{
  background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);
  color:#fff;padding:40px 20px;text-align:center;
}
.header h1{font-size:2.2em;font-weight:700;margin-bottom:4px}
.header .date{opacity:.85;font-size:1.05em}
.container{max-width:900px;margin:0 auto;padding:20px 16px 60px}
.overview{display:flex;gap:10px;flex-wrap:wrap;margin:24px 0}
.overview-card{
  background:#fff;border-radius:12px;padding:14px 18px;
  box-shadow:0 1px 4px rgba(0,0,0,.06);
  display:flex;align-items:center;gap:10px;flex:1;min-width:140px;
}
.platform-icon{font-size:1.6em}
.platform-name{font-weight:600;font-size:.92em}
.platform-count{margin-left:auto;color:#888;font-size:.82em}
.ai-summary{
  background:linear-gradient(135deg,#e0c3fc,#8ec5fc);
  border-radius:14px;padding:20px 24px;margin:24px 0;
}
.ai-badge{
  display:inline-block;background:rgba(255,255,255,.7);
  border-radius:20px;padding:3px 12px;font-size:.82em;
  font-weight:600;margin-bottom:10px;
}
.ai-summary p{font-size:.98em;color:#333;line-height:1.7}
.category-section{margin:28px 0}
.category-title{
  font-size:1.3em;font-weight:700;
  padding-bottom:10px;border-bottom:2px solid #667eea;margin-bottom:14px;
}
.trend-card{
  background:#fff;border-radius:12px;padding:16px 18px;margin-bottom:10px;
  box-shadow:0 1px 3px rgba(0,0,0,.05);transition:box-shadow .2s;
}
.trend-card:hover{box-shadow:0 3px 12px rgba(0,0,0,.1)}
.trend-header{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.trend-rank{
  background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;
  border-radius:8px;padding:2px 8px;font-size:.78em;font-weight:700;
  flex-shrink:0;
}
.trend-title{font-weight:700;font-size:1.05em;flex:1}
.trend-title a{color:#333;text-decoration:none;border-bottom:2px solid transparent;transition:border-color .2s}
.trend-title a:hover{border-bottom-color:#667eea;color:#667eea}
.title-link{
  display:inline-block;border-radius:8px;padding:2px 8px;
  font-size:.72em;font-weight:500;text-decoration:none;
  margin-left:6px;transition:opacity .2s;vertical-align:middle;
}
.title-link:hover{opacity:.75}
.trend-heat{font-size:1em;flex-shrink:0}
.trend-platforms{margin-bottom:6px}
.platform-tag{
  display:inline-block;border-radius:10px;padding:2px 9px;
  font-size:.76em;margin-right:5px;font-weight:500;
}
.trend-desc{color:#555;font-size:.92em;margin-bottom:4px}
.trend-why{color:#888;font-size:.85em;font-style:italic;margin-bottom:4px}
.trend-usage{
  background:#f0f7ff;border-left:3px solid #667eea;
  padding:8px 12px;border-radius:0 8px 8px 0;
  font-size:.88em;color:#444;margin-top:8px;
}
.error-notice{
  background:#fff3cd;border:1px solid #ffc107;border-radius:10px;
  padding:14px 18px;margin:20px 0;font-size:.9em;color:#856404;
}
details.platform-section{
  background:#fff;border-radius:12px;margin-bottom:10px;
  box-shadow:0 1px 3px rgba(0,0,0,.05);overflow:hidden;
}
details.platform-section summary{
  padding:14px 18px;font-weight:600;font-size:1.02em;
  cursor:pointer;user-select:none;list-style:none;
  display:flex;align-items:center;gap:8px;
}
details.platform-section summary::-webkit-details-marker{display:none}
details.platform-section summary::after{
  content:"▾";margin-left:auto;transition:transform .2s;color:#999;
}
details[open] summary::after{transform:rotate(180deg)}
.count-badge{
  background:#f0f0f0;border-radius:10px;padding:2px 8px;
  font-size:.78em;color:#666;font-weight:400;margin-left:4px;
}
.table-wrap{padding:0 12px 12px}
table{width:100%;border-collapse:collapse;font-size:.9em}
thead{background:#fafafa}
th{padding:8px 12px;text-align:left;font-weight:600;color:#888;font-size:.85em;border-bottom:1px solid #eee}
td{padding:9px 12px;border-bottom:1px solid #f5f5f5}
.rank-cell{width:40px;color:#bbb;font-weight:600;text-align:center}
.title-cell a{color:#333;text-decoration:none}
.title-cell a:hover{color:#667eea}
.heat-cell{width:100px;text-align:right}
.heat-badge{font-size:.82em;color:#888}
.footer{text-align:center;color:#aaa;font-size:.82em;padding:20px 0}
@media(max-width:600px){
  .header h1{font-size:1.6em}
  .overview-card{min-width:100%}
}
</style>
</head>
<body>
<div class="header">
  <h1>📡 热梗雷达</h1>
  <div class="date">${dateStr} · 共收录 ${total} 条热点</div>
</div>
<div class="container">
  <div class="overview">${overviewCards}</div>
  ${aiSummarySection}
  ${categoriesHtml}
  <h2 style="margin:32px 0 16px;font-size:1.2em;color:#555">📋 原始榜单</h2>
  ${rawSections}
  ${errorsHtml}
</div>
<div class="footer">Powered by 热梗雷达 · 数据采集于 ${dateStr}</div>
</body>
</html>`;
}

export function saveReport(content, filename) {
  mkdirSync(config.outputDir, { recursive: true });
  const filepath = join(config.outputDir, filename);
  writeFileSync(filepath, content, "utf-8");
  return filepath;
}
