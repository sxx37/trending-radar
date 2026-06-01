/**
 * 热榜归档站抓取
 * 从聚合站获取近期（非仅此刻）的热搜历史数据
 */
import { safeFetch } from "./utils.js";

/**
 * 从聚合站/归档站抓取近期热搜数据
 * 优先返回 JSON，否则返回原始文本供 AI 阅读
 */
export async function fetchAggregatedTrends() {
  const sources = [
    {
      name: "今日热榜",
      url: "https://tophub.today",
      parse: (text) => extractTophub(text),
    },
    {
      name: "热搜狗",
      url: "https://rebang.today/",
      parse: (text) => text,
    },
    {
      name: "GitHub Dailyhot",
      url: "https://github.com/imsyy/DailyHotApi",
      parse: (text) => text,
    },
    {
      name: "千瓜热榜",
      url: "https://www.qian-gua.com/",
      parse: (text) => text,
    },
  ];

  const results = [];

  for (const source of sources) {
    try {
      const resp = await safeFetch(source.url, {
        headers: { "Accept": "text/html,application/json" },
      });
      if (!resp) continue;

      const text = await resp.text();
      if (!text || text.length < 100) continue;

      const parsed = source.parse(text);
      if (parsed && parsed.length > 50) {
        results.push({
          source: source.name,
          content: parsed.slice(0, 8000), // 限制长度
        });
      }
    } catch {}
  }

  return results;
}

/**
 * 解析 tophub.today 页面，提取各平台热榜标题
 */
function extractTophub(html) {
  // 粗略提取所有 <td> 中的文本内容作为热榜条目
  const titles = [];
  // 匹配表格中的链接文字
  const regex = /<a[^>]*href="(\/n\/[^"]*|https?:\/\/[^"]*)"[^>]*>([^<]+)<\/a>/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const title = match[2].trim();
    if (title.length > 2 && title.length < 100) {
      titles.push(title);
    }
  }
  return titles.join("\n");
}

/**
 * 构建"近期趋势搜索"的 prompt 片段
 * 让 AI 基于聚合站数据 + 训练知识，总结近 3-5 天的热梗
 */
export function buildRecentTrendsPrompt(aggregatedData, snapshotData) {
  let prompt = "";

  // 聚合站数据
  if (aggregatedData.length) {
    prompt += "=== 热榜聚合站近期数据 ===\n";
    for (const agg of aggregatedData) {
      prompt += `\n【${agg.source}】\n${agg.content}\n`;
    }
  }

  // 实时快照
  if (snapshotData.length) {
    prompt += "\n=== 当前各平台实时热搜 ===\n";
    for (const item of snapshotData.slice(0, 60)) {
      const platforms = Array.isArray(item.platforms)
        ? item.platforms.join("/")
        : item.platforms || "";
      prompt += `[${platforms}] ${item.title}\n`;
    }
  }

  return prompt;
}
