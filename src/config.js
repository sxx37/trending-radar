/**
 * 配置文件 - 热梗雷达
 */
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: join(__dirname, "..", ".env") });

export const config = {
  // 数据源开关
  sources: {
    weibo:      { name: "微博热搜", icon: "🔥", enabled: true },
    bilibili:   { name: "B站热榜",  icon: "📺", enabled: true },
    baidu:      { name: "百度热搜", icon: "🔍", enabled: true },
    douyin:     { name: "抖音热榜", icon: "🎵", enabled: true },
    xiaohongshu:{ name: "小红书",   icon: "📕", enabled: true },
  },

  // AI 配置
  ai: {
    apiKey:   process.env.AI_API_KEY   || "",
    baseUrl:  process.env.AI_BASE_URL  || "https://api.openai.com/v1",
    model:    process.env.AI_MODEL     || "gpt-4o-mini",
  },

  // 请求配置
  timeout: 15_000,
  maxItemsPerSource: 30,
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",

  // 输出
  outputDir: join(__dirname, "..", "reports"),
};
