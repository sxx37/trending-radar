/**
 * 热梗雷达 - 主程序
 * 抓取实时快照 → 聚合站近期数据 → 跨平台去重 → AI 综合分析 → 生成报告
 */
import { config } from "./config.js";
import { fetchAll, mergeAcrossPlatforms } from "./scrapers.js";
import { fetchAggregatedTrends } from "./aggregation.js";
import { summarize, buildBasicReport } from "./summarizer.js";
import { generateHtml, saveReport } from "./report.js";

/**
 * 标题模糊匹配（去掉标点和空格后比较）
 */
function titleMatch(a, b) {
  if (!a || !b) return false;
  const clean = (s) => s.replace(/[\s\u3000,.，。！？、；：""''【】《》（）()~～#【】「」『』·]/g, "");
  const ca = clean(a);
  const cb = clean(b);
  if (ca === cb) return true;
  if (ca.includes(cb) || cb.includes(ca)) return true;
  // 取前 8 个字符比较
  if (ca.length >= 6 && cb.length >= 6 && ca.slice(0, 8) === cb.slice(0, 8)) return true;
  return false;
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    useAi: !args.includes("--no-ai"),
    outFile: args.find((a) => a.startsWith("--out="))?.split("=")[1],
  };
}

async function main() {
  const { useAi, outFile } = parseArgs();

  console.log("=".repeat(50));
  console.log(
    `  📡 热梗雷达  ${new Date().toISOString().slice(0, 16).replace("T", " ")}`
  );
  console.log("=".repeat(50));

  // ── Step 1: 抓取各平台实时热搜 ──
  console.log("\n📡 Step 1/5: 抓取各平台实时热搜...\n");
  const { results: rawData, errors } = await fetchAll();

  const total = Object.values(rawData).reduce((s, v) => s + v.length, 0);
  const sourcesOk = Object.keys(rawData).filter((k) => rawData[k]?.length);

  console.log(`\n${"─".repeat(40)}`);
  console.log(`  抓取完成: ${total} 条热点, ${sourcesOk.length} 个平台成功`);
  if (Object.keys(errors).length) {
    console.log(`  失败: ${Object.keys(errors).join(", ")}`);
  }
  console.log(`${"─".repeat(40)}`);

  if (total === 0) {
    console.log("\n❌ 所有平台均获取失败，请检查网络连接后重试。");
    process.exit(1);
  }

  // ── Step 2: 跨平台去重合并 ──
  console.log("\n🔄 Step 2/5: 跨平台去重合并...\n");
  const mergedData = mergeAcrossPlatforms(rawData);
  const crossPlatform = mergedData.filter((m) => m.platformCount > 1);
  console.log(`  合并后: ${mergedData.length} 个独立话题`);
  console.log(`  跨平台出圈: ${crossPlatform.length} 个`);
  if (crossPlatform.length) {
    crossPlatform.slice(0, 5).forEach((m) => {
      console.log(`    🔥 ${m.title} → ${m.platforms.join(" × ")}`);
    });
  }

  // ── Step 3: 抓取聚合站近期数据 ──
  console.log("\n📚 Step 3/5: 抓取聚合站近期热榜数据...\n");
  const aggregatedData = await fetchAggregatedTrends();
  if (aggregatedData.length) {
    console.log(`  ✅ 获取到 ${aggregatedData.length} 个聚合站数据`);
    aggregatedData.forEach((a) => {
      console.log(`    📄 ${a.source} (${a.content.length} 字)`);
    });
  } else {
    console.log("  ⚠️  聚合站数据获取为空，将仅基于实时快照分析");
  }

  // ── Step 4: AI 综合分析 ──
  console.log("\n📝 Step 4/5: AI 综合分析...\n");
  let summary = null;
  if (useAi && config.ai.apiKey) {
    summary = await summarize(rawData, mergedData, aggregatedData);
  }
  if (!summary) {
    summary = buildBasicReport(rawData, mergedData);
  }

  // ── Step 5: 匹配链接 + 生成报告 ──
  console.log("\n📊 Step 5/5: 匹配链接 + 生成报告...\n");

  // 把原始数据的 URL 匹配回 AI 筛选的 Top 30
  const allRawItems = [];
  for (const [src, items] of Object.entries(rawData)) {
    for (const it of items) {
      if (it.title && it.url) {
        allRawItems.push({ title: it.title, url: it.url, src });
      }
    }
  }

  const trends = summary?.top30 || summary?.categories?.[0]?.trends || [];
  let matchCount = 0;
  for (const t of trends) {
    if (t.urls) continue; // 已有链接就跳过
    const urls = [];
    for (const raw of allRawItems) {
      if (titleMatch(t.title, raw.title)) {
        urls.push({ platform: raw.src, url: raw.url });
      }
    }
    if (urls.length) {
      t.urls = urls;
      matchCount++;
    }
  }
  console.log(`  🔗 链接匹配: ${matchCount}/${trends.length} 条已关联跳转链接`);

  const htmlContent = generateHtml(rawData, summary, errors);
  const dateStr = new Date().toISOString().slice(0, 10);
  const htmlFile = outFile || `trending-${dateStr}.html`;
  const htmlPath = saveReport(htmlContent, htmlFile);
  console.log(`  ✅ HTML 报告: ${htmlPath}`);

  const jsonData = { date: dateStr, summary, merged: mergedData, raw_data: rawData };
  const jsonPath = saveReport(
    JSON.stringify(jsonData, null, 2),
    `trending-${dateStr}.json`
  );
  console.log(`  ✅ JSON 数据: ${jsonPath}`);

  // ── 摘要 ──
  console.log(`\n${"=".repeat(50)}`);
  console.log("  📊 本期热梗雷达报告");
  console.log(`${"=".repeat(50)}`);
  console.log(`  📅 日期: ${dateStr}`);
  console.log(`  📡 数据源: ${sourcesOk.join(", ")}`);
  console.log(`  📈 原始热点: ${total} → 合并: ${mergedData.length} → AI 筛选: ${(summary?.top30 || summary?.categories?.[0]?.trends || []).length}`);

  const topTopics = summary?.top30 || summary?.categories?.[0]?.trends || mergedData.slice(0, 10);
  console.log("\n  🔥 本期值得关注的热梗:");
  topTopics.slice(0, 10).forEach((item, i) => {
    const platforms = Array.isArray(item.platforms) ? item.platforms.join("/") : "";
    console.log(`    ${String(i + 1).padStart(2)}. [${platforms}] ${item.title}`);
  });

  console.log(`\n  📂 报告位置: ${htmlPath}`);
  console.log(`${"=".repeat(50)}`);

  console.log(`\n  💡 报告将自动在浏览器中打开`);
}

main().catch((e) => {
  console.error("❌ 程序异常:", e.message);
  process.exit(1);
});
