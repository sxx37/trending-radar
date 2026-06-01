/**
 * 工具函数
 */
import { config } from "./config.js";

/**
 * 带重试的 HTTP 请求
 */
export async function safeFetch(url, options = {}) {
  const headers = {
    "User-Agent": config.userAgent,
    "Accept-Language": "zh-CN,zh;q=0.9",
    ...options.headers,
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeout || config.timeout);

      const resp = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timer);

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp;
    } catch {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));
      }
    }
  }
  return null;
}

/**
 * 按 title 去重
 */
export function dedup(items, key = "title") {
  const seen = new Set();
  return items.filter((item) => {
    const t = (item[key] || "").trim();
    if (!t || seen.has(t)) return false;
    seen.add(t);
    return true;
  });
}
