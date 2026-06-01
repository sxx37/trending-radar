/**
 * 反馈系统 - JSON 文件存储
 * 支持：提交反馈、回复反馈、点赞、获取列表
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "..", "data", "feedback.json");

function ensureDir() {
  const dir = dirname(DATA_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function load() {
  ensureDir();
  if (!existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function save(data) {
  ensureDir();
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * 获取所有反馈（按点赞数倒序，同赞数按时间倒序）
 */
export function getAllFeedback() {
  return load().sort((a, b) => {
    const likeDiff = (b.likes || 0) - (a.likes || 0);
    if (likeDiff !== 0) return likeDiff;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

/**
 * 提交新反馈（昵称可选）
 */
export function addFeedback({ username, content, category }) {
  if (!content?.trim()) {
    return { error: "内容不能为空" };
  }
  const items = load();
  const feedback = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    username: (username?.trim() || "匿名用户").slice(0, 20),
    content: content.trim().slice(0, 500),
    category: category || "建议",
    createdAt: new Date().toISOString(),
    likes: 0,
    likedBy: [],
    replies: [],
  };
  items.push(feedback);
  save(items);
  return { success: true, feedback };
}

/**
 * 回复某条反馈
 */
export function replyFeedback({ id, username, content }) {
  if (!id || !content?.trim()) {
    return { error: "回复内容不能为空" };
  }
  const items = load();
  const item = items.find((f) => f.id === id);
  if (!item) return { error: "反馈不存在" };

  const reply = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    username: username || "管理员",
    content: content.trim().slice(0, 500),
    createdAt: new Date().toISOString(),
    isAdmin: username === "admin" || username === "管理员",
  };
  item.replies.push(reply);
  save(items);
  return { success: true, reply };
}

/**
 * 点赞/取消点赞（基于浏览器 fingerprint）
 */
export function toggleLike({ id, fingerprint }) {
  if (!id || !fingerprint) return { error: "参数缺失" };
  const items = load();
  const item = items.find((f) => f.id === id);
  if (!item) return { error: "反馈不存在" };

  if (!item.likedBy) item.likedBy = [];
  if (!item.likes) item.likes = 0;

  const idx = item.likedBy.indexOf(fingerprint);
  if (idx >= 0) {
    item.likedBy.splice(idx, 1);
    item.likes--;
  } else {
    item.likedBy.push(fingerprint);
    item.likes++;
  }
  save(items);
  return { success: true, likes: item.likes, liked: idx < 0 };
}
