/**
 * 数据抓取模块
 * 每个函数返回 [{ rank, title, heat, url }]
 */
import * as cheerio from "cheerio";
import { safeFetch } from "./utils.js";
import { config } from "./config.js";

// ═══════════════════════════════════════
//  微博热搜（公开 API）
// ═══════════════════════════════════════

export async function fetchWeibo() {
  // 方式 1：官方 Ajax 接口
  const resp = await safeFetch("https://weibo.com/ajax/side/hotSearch", {
    headers: { Referer: "https://weibo.com" },
  });
  if (resp) {
    try {
      const data = await resp.json();
      const realtime = data?.data?.realtime || [];
      const items = realtime.slice(0, 30).map((item, i) => ({
        rank: i + 1,
        title: item.word || "",
        heat: item.num ? Number(item.num).toLocaleString() : "",
        url: `https://s.weibo.com/weibo?q=%23${encodeURIComponent(item.word)}%23`,
      }));
      if (items.length) {
        console.log(`  ✅ 微博热搜: 获取 ${items.length} 条`);
        return items;
      }
    } catch {}
  }

  // 方式 2：移动端 API
  console.log("  ⚠️  微博 API 失败，尝试移动端...");
  const resp2 = await safeFetch(
    "https://m.weibo.cn/api/container/getIndex?containerid=106003type%3D25%26t%3D3%26disable_hot%3D1%26filter_type%3Drealtimehot"
  );
  if (resp2) {
    try {
      const data = await resp2.json();
      const cards = data?.data?.cards || [];
      const items = [];
      for (const card of cards) {
        for (const g of card.card_group || []) {
          const desc = g.desc || "";
          if (desc) {
            items.push({
              rank: items.length + 1,
              title: desc,
              heat: g.desc_extr || "",
              url: g.scheme || "",
            });
            if (items.length >= 30) break;
          }
        }
        if (items.length >= 30) break;
      }
      if (items.length) {
        console.log(`  ✅ 微博热搜(备用): 获取 ${items.length} 条`);
        return items;
      }
    } catch {}
  }

  console.log("  ❌ 微博热搜获取失败");
  return [];
}

// ═══════════════════════════════════════
//  B站热榜（官方 API）
// ═══════════════════════════════════════

export async function fetchBilibili() {
  const resp = await safeFetch("https://api.bilibili.com/x/web-interface/popular?ps=30&pn=1", {
    headers: { Referer: "https://www.bilibili.com" },
  });
  if (resp) {
    try {
      const data = await resp.json();
      if (data.code === 0) {
        const items = (data.data?.list || []).slice(0, 30).map((item, i) => ({
          rank: i + 1,
          title: item.title || "",
          heat: item.stat?.view ? `${Number(item.stat.view).toLocaleString()}播放` : "",
          url: `https://www.bilibili.com/video/${item.bvid || ""}`,
        }));
        if (items.length) {
          console.log(`  ✅ B站热榜: 获取 ${items.length} 条`);
          return items;
        }
      }
    } catch {}
  }

  // 备用接口
  console.log("  ⚠️  B站 API 失败，尝试排行榜...");
  const resp2 = await safeFetch("https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all", {
    headers: { Referer: "https://www.bilibili.com" },
  });
  if (resp2) {
    try {
      const data = await resp2.json();
      if (data.code === 0) {
        const items = (data.data?.list || []).slice(0, 30).map((item, i) => ({
          rank: i + 1,
          title: item.title || "",
          heat: item.stat?.view ? `${Number(item.stat.view).toLocaleString()}播放` : "",
          url: `https://www.bilibili.com/video/${item.bvid || ""}`,
        }));
        if (items.length) {
          console.log(`  ✅ B站热榜(备用): 获取 ${items.length} 条`);
          return items;
        }
      }
    } catch {}
  }

  console.log("  ❌ B站热榜获取失败");
  return [];
}

// ═══════════════════════════════════════
//  百度热搜（页面解析）
// ═══════════════════════════════════════

export async function fetchBaidu() {
  const resp = await safeFetch("https://top.baidu.com/board?tab=realtime");
  if (!resp) {
    console.log("  ❌ 百度热搜获取失败");
    return [];
  }

  try {
    const html = await resp.text();
    const $ = cheerio.load(html);

    // 尝试从嵌入的 JSON 数据提取
    const scripts = $("script").toArray();
    for (const script of scripts) {
      const text = $(script).html() || "";
      const match = text.match(/<!--s-data:(.*?)-->/s);
      if (match) {
        const data = JSON.parse(match[1]);
        const cards = data?.data?.cards || [];
        const items = [];
        for (const card of cards) {
          for (const item of card.content || []) {
            items.push({
              rank: items.length + 1,
              title: item.word || "",
              heat: item.hotScore || "",
              url: item.url || item.rawUrl || "",
            });
            if (items.length >= 30) break;
          }
          if (items.length >= 30) break;
        }
        if (items.length) {
          console.log(`  ✅ 百度热搜: 获取 ${items.length} 条`);
          return items;
        }
      }
    }

    // 回退：HTML 解析
    const items = [];
    $("[class*=title]").each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 1 && items.length < 30) {
        items.push({ rank: items.length + 1, title: text, heat: "", url: "" });
      }
    });
    if (items.length) {
      console.log(`  ✅ 百度热搜(HTML): 获取 ${items.length} 条`);
      return items;
    }
  } catch (e) {
    console.log(`  ❌ 百度热搜解析失败: ${e.message}`);
  }

  return [];
}

// ═══════════════════════════════════════
//  抖音热榜（聚合站）
// ═══════════════════════════════════════

export async function fetchDouyin() {
  const apiSources = [
    {
      name: "Dailyhot (vvhan)",
      url: "https://api.vvhan.com/api/hotlist/douyinHot",
      parse: (data) =>
        (data.data || []).slice(0, 30).map((item, i) => ({
          rank: i + 1,
          title: item.title || "",
          heat: item.hot || item.desc || "",
          url: item.url || item.mobilUrl || "",
        })),
    },
    {
      name: "Dailyhot (imarkr)",
      url: "https://api.imarkr.com/api/hot/douyin",
      parse: (data) =>
        (data.data || []).slice(0, 30).map((item, i) => ({
          rank: i + 1,
          title: item.title || "",
          heat: item.hot || item.desc || "",
          url: item.url || item.mobilUrl || "",
        })),
    },
  ];

  for (const source of apiSources) {
    const resp = await safeFetch(source.url);
    if (resp) {
      try {
        const data = await resp.json();
        if (data.data?.length) {
          const items = source.parse(data).filter((x) => x.title);
          if (items.length) {
            console.log(`  ✅ 抖音热榜(${source.name}): 获取 ${items.length} 条`);
            return items;
          }
        }
      } catch {}
    }
  }

  // 回退：Tophub
  console.log("  ⚠️  抖音聚合 API 不可用，尝试 Tophub...");
  return fetchFromTophub("https://tophub.today/n/DpQvNABoNE", "抖音");
}

// ═══════════════════════════════════════
//  小红书（第三方 API / AI 搜索）
// ═══════════════════════════════════════

export async function fetchXiaohongshu(aiConfig) {
  // 先尝试第三方 API
  const thirdParty = [
    "https://api.vvhan.com/api/hotlist/xhsHot",
    "https://api.imarkr.com/api/hot/xhs",
  ];
  for (const apiUrl of thirdParty) {
    const resp = await safeFetch(apiUrl);
    if (resp) {
      try {
        const data = await resp.json();
        if (data.data?.length) {
          const items = data.data.slice(0, 30).map((item, i) => ({
            rank: i + 1,
            title: item.title || "",
            heat: item.hot || item.desc || "",
            url: item.url || item.mobilUrl || "",
          })).filter((x) => x.title);
          if (items.length) {
            console.log(`  ✅ 小红书(第三方): 获取 ${items.length} 条`);
            return items;
          }
        }
      } catch {}
    }
  }

  console.log("  ⚠️  小红书无公开 API，暂不支持自动抓取");
  console.log("       AI 搜索无法获取实时小红书数据，已跳过");
  return [];
}

// ═══════════════════════════════════════
//  Tophub 通用抓取
// ═══════════════════════════════════════

async function fetchFromTophub(url, platformName) {
  const resp = await safeFetch(url, { headers: { Referer: "https://tophub.today" } });
  if (!resp) return [];

  try {
    const html = await resp.text();
    const $ = cheerio.load(html);
    const table = $("table");
    if (!table.length) return [];

    const items = [];
    table.find("tr").each((_, tr) => {
      const a = $(tr).find("a");
      if (!a.length) return;
      const title = a.text().trim();
      if (!title || title.length < 2) return;
      let link = a.attr("href") || "";
      if (link && !link.startsWith("http")) link = "https://tophub.today" + link;
      const tds = $(tr).find("td");
      const heat = tds.length > 1 ? $(tds[1]).text().trim() : "";
      items.push({ rank: items.length + 1, title, heat, url: link });
      if (items.length >= 30) return false; // break
    });

    if (items.length) console.log(`  ✅ ${platformName}热榜(Tophub): 获取 ${items.length} 条`);
    return items;
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════
//  跨平台去重合并
// ═══════════════════════════════════════

const SOURCE_NAMES = {
  weibo: "微博",
  bilibili: "B站",
  baidu: "百度",
  douyin: "抖音",
  xiaohongshu: "小红书",
};

/**
 * 简单文本相似度（基于共同字符占比）
 */
function similarity(a, b) {
  if (!a || !b) return 0;
  // 去掉常见停用词和标点
  const clean = (s) => s.replace(/[\s\u3000,.，。！？、；：""''【】《》（）()~～#]/g, "");
  const ca = clean(a);
  const cb = clean(b);
  if (!ca || !cb) return 0;
  if (ca === cb) return 1;

  // 短字符串完全包含
  if (ca.includes(cb) || cb.includes(ca)) return 0.85;

  // 字符交集 / 较短串长度
  const setA = new Set(ca);
  const setB = new Set(cb);
  let common = 0;
  for (const c of setA) if (setB.has(c)) common++;
  return common / Math.min(setA.size, setB.size);
}

/**
 * 跨平台合并：把多个平台的热搜合并，标注每个话题出现在哪些平台
 * 返回去重后的数组，按"跨平台权重"排序
 */
export function mergeAcrossPlatforms(rawData) {
  // 先把所有条目扁平化，带上来源标记
  const allItems = [];
  for (const [src, items] of Object.entries(rawData)) {
    for (const item of items) {
      allItems.push({ ...item, _src: src, _platform: SOURCE_NAMES[src] || src });
    }
  }

  // 贪心合并：逐条检查是否跟已有合并组相似
  const groups = []; // [{ title, platforms: Set, items: [], topHeat }]
  const used = new Set();

  for (let i = 0; i < allItems.length; i++) {
    if (used.has(i)) continue;
    const cur = allItems[i];
    const group = {
      title: cur.title,
      platforms: new Set([cur._platform]),
      items: [cur],
      topHeat: cur.heat || "",
      topRank: cur.rank || 999,
      topSrc: cur._src,
    };

    for (let j = i + 1; j < allItems.length; j++) {
      if (used.has(j)) continue;
      const other = allItems[j];
      // 同平台跳过
      if (other._src === cur._src) continue;
      // 文本相似度检查
      if (similarity(cur.title, other.title) > 0.6) {
        group.platforms.add(other._platform);
        group.items.push(other);
        used.add(j);
        // 保留排名更靠前的作为标题
        if ((other.rank || 999) < group.topRank) {
          group.title = other.title;
          group.topRank = other.rank;
          group.topSrc = other._src;
        }
      }
    }

    groups.push(group);
    used.add(i);
  }

  // 排序：跨平台数 > 平台内排名
  groups.sort((a, b) => {
    const platformDiff = b.platforms.size - a.platforms.size;
    if (platformDiff !== 0) return platformDiff;
    return a.topRank - b.topRank;
  });

  // 格式化输出
  return groups.map((g, i) => ({
    rank: i + 1,
    title: g.title,
    platforms: [...g.platforms],
    platformCount: g.platforms.size,
    heat: g.topHeat,
    description: "",
    why_hot: "",
    usage: "",
  }));
}

// ═══════════════════════════════════════
//  汇总入口
// ═══════════════════════════════════════

const FETCHERS = {
  weibo: fetchWeibo,
  bilibili: fetchBilibili,
  baidu: fetchBaidu,
  douyin: fetchDouyin,
  xiaohongshu: fetchXiaohongshu,
};

export async function fetchAll(sources = null) {
  if (!sources) {
    sources = Object.entries(config.sources)
      .filter(([, v]) => v.enabled)
      .map(([k]) => k);
  }

  const results = {};
  const errors = {};

  for (const src of sources) {
    if (!FETCHERS[src]) continue;
    const meta = config.sources[src] || { name: src };
    console.log(`\n📡 正在抓取 ${meta.name}...`);
    try {
      const items = src === "xiaohongshu"
        ? await FETCHERS[src](config.ai)
        : await FETCHERS[src]();
      results[src] = items || [];
    } catch (e) {
      errors[src] = e.message;
      results[src] = [];
      console.log(`  ❌ ${src} 异常: ${e.message}`);
    }
  }

  return { results, errors };
}
