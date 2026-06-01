/**
 * AI 整理模块
 * 结合实时快照 + 聚合站数据，筛选出近 3-5 天最有价值的热梗
 */
import { config } from "./config.js";

const SOURCE_NAMES = {
  weibo: "微博",
  bilibili: "B站",
  baidu: "百度",
  douyin: "抖音",
  xiaohongshu: "小红书",
};

/**
 * AI 整理热搜数据（核心函数）
 * @param {Object} rawData - 各平台实时快照
 * @param {Array} mergedData - 跨平台合并后的数据
 * @param {Array} aggregatedData - 聚合站近期数据 [{source, content}]
 */
export async function summarize(rawData, mergedData, aggregatedData = []) {
  if (!config.ai.apiKey) return null;

  let OpenAI;
  try {
    OpenAI = (await import("openai")).default;
  } catch {
    console.log("  ❌ 未安装 openai 库，跳过 AI 整理");
    return null;
  }

  // ── 构建数据输入 ──

  // 1. 聚合站近期数据（限制长度，避免超出 AI 上下文）
  let aggregationText = "";
  if (aggregatedData.length) {
    aggregationText = aggregatedData
      .map((a) => `【${a.source}】\n${a.content.slice(0, 2000)}`)
      .join("\n\n")
      .slice(0, 6000); // 总计不超过 6000 字
  }

  // 2. 跨平台合并的实时快照
  const snapshotLines = (mergedData || [])
    .slice(0, 60)
    .map((item) => {
      const platforms = Array.isArray(item.platforms)
        ? item.platforms.join("/")
        : "";
      return `[${platforms}] ${item.title}`;
    });

  // 3. 各平台 top 原始数据
  const rawLines = [];
  for (const [src, items] of Object.entries(rawData)) {
    if (!items?.length) continue;
    const name = SOURCE_NAMES[src] || src;
    const top = items.slice(0, 15).map((it) => `  ${it.rank}. ${it.title}`);
    rawLines.push(`【${name}】\n${top.join("\n")}`);
  }

  if (!snapshotLines.length && !rawLines.length && !aggregationText) return null;

  const today = new Date().toISOString().slice(0, 10);

  // ── AI Prompt ──
  const systemPrompt = `你是一位资深的互联网文化观察者和自媒体内容策划师。你的任务是综合多渠道数据，筛选出近 3-5 天最有价值的 30 个热梗/话题。

## 你会收到两类数据
1. **聚合站近期数据**：来自热榜归档/聚合网站，反映近期（不只此刻）的热点趋势
2. **实时热搜快照**：各平台当前时刻的热搜榜，反映当下的热度

## 筛选标准（按优先级）
1. **有"梗"**：有明确的梗、金句、名场面、文化符号（比如"做完你的做你的"这种有记忆点的）
2. **跨平台出圈**：在多个平台同时出现的话题，说明已经突破圈层
3. **有讨论空间**：能引发观点碰撞、能做内容延伸的话题
4. **近期持续发酵**：不只是某一刻的热搜，而是在近几天内持续被讨论的话题优先

## 过滤掉
- 纯品牌营销/广告
- 纯明星八卦水榜（除非有社会讨论价值）
- 地方性新闻（除非有全国讨论度）
- 没有明确含义的模糊标题

## 创作建议
给出的自媒体创作建议要**开放灵活**，不要预设固定赛道。可以从多个角度思考：
- 视觉/设计/审美角度
- 美妆/护肤/好物分享
- 生活方式/情感/成长
- 知识科普/热点解读
- 哪些角度做出来容易有流量

严格按以下 JSON 格式返回，不要添加任何 markdown 标记或其他文字：

{
    "summary": "用 2-3 句话总结近几天网络热点的整体趋势和值得关注的文化现象",
    "top30": [
        {
            "rank": 1,
            "title": "热梗/话题名",
            "platforms": ["微博", "抖音"],
            "heat_level": "🔥🔥🔥🔥🔥",
            "description": "一句话解释这个梗是什么意思、怎么来的",
            "why_hot": "为什么火：来源背景、引发共鸣的点",
            "usage": "自媒体创作建议：可以从哪些角度切入做内容，给出 1-2 个具体的内容选题方向"
        }
    ]
}`;

  // ── 拼接 user message ──
  let userMessage = `今天是 ${today}。请综合以下数据，筛选出近 3-5 天最有价值的 30 个热梗。\n\n`;

  if (aggregationText) {
    userMessage += `=== 热榜聚合站近期数据 ===\n${aggregationText}\n\n`;
  }
  if (snapshotLines.length) {
    userMessage += `=== 当前实时热搜快照（跨平台合并） ===\n${snapshotLines.join("\n")}\n\n`;
  }
  if (rawLines.length) {
    userMessage += `=== 各平台原始热搜 Top 15 ===\n${rawLines.join("\n\n")}\n\n`;
  }

  userMessage += "请综合分析，输出 JSON 格式的热梗报告。";

  console.log("  🤖 AI 正在分析近几天热梗趋势...");
  console.log(`  [DEBUG] API Key: ${config.ai.apiKey ? config.ai.apiKey.slice(0, 10) + "..." : "无"}`);
  console.log(`  [DEBUG] 用户消息长度: ${userMessage.length} 字符`);

  try {
    const client = new OpenAI({
      apiKey: config.ai.apiKey,
      baseURL: config.ai.baseUrl,
    });

    const resp = await client.chat.completions.create({
      model: config.ai.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
      timeout: 120_000,
    });

    let text = resp.choices[0].message.content.trim();
    text = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    // 清理 AI 返回的非法控制字符（保留 JSON 字符串内的换行）
    text = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
    // 如果清理后不是以 { 开头，尝试提取 JSON 部分
    if (!text.startsWith("{")) {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) text = jsonMatch[0];
    }
    console.log("  [DEBUG] AI 返回前200字:", text.slice(0, 200));

    const report = JSON.parse(text);
    report.date = today;

    if (report.top30 && !report.categories) {
      report.categories = [{
        name: "🔥 近期热梗 Top 30",
        trends: report.top30,
      }];
    }

    console.log(`  ✅ AI 整理完成，筛选出 ${(report.top30 || []).length} 个热梗`);
    return report;
  } catch (e) {
    console.log(`  ❌ AI 整理失败: ${e.message}`);
    console.log(`  [DEBUG] 错误详情:`, e.status || "", e.code || "");
    if (e.response?.data) console.log(`  [DEBUG] 响应:`, JSON.stringify(e.response.data).slice(0, 300));
    return null;
  }
}

/**
 * 无 AI 时的基础报告
 */
export function buildBasicReport(rawData, mergedData) {
  if (mergedData?.length) {
    return {
      date: new Date().toISOString().slice(0, 10),
      summary: "（未配置 AI，按跨平台出现频次排序。配置 AI_API_KEY 后可获取智能筛选和梗含义解读）",
      categories: [{
        name: "📋 跨平台热门话题（按出现平台数排序）",
        trends: mergedData.slice(0, 30).map((it) => ({
          title: it.title,
          platforms: it.platforms,
          description: `出现在 ${it.platforms.join("、")} ${it.platforms.length} 个平台`,
          why_hot: "",
          usage: "",
        })),
      }],
    };
  }

  const categories = [];
  for (const [src, items] of Object.entries(rawData)) {
    if (!items?.length) continue;
    categories.push({
      name: SOURCE_NAMES[src] || src,
      trends: items.slice(0, 15).map((it) => ({
        title: it.title,
        platforms: [SOURCE_NAMES[src] || src],
        description: `热度: ${it.heat || "-"}`,
        why_hot: "",
        usage: "",
      })),
    });
  }

  return {
    date: new Date().toISOString().slice(0, 10),
    summary: "（未配置 AI，仅展示原始热搜数据。配置 AI_API_KEY 后可获取智能分类和创作建议）",
    categories,
  };
}
