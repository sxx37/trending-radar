/**
 * 反馈系统 - Supabase 云端存储
 * 替代 JSON 文件存储，支持 Vercel 部署
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_KEY || ""
);

/**
 * 获取所有反馈（按点赞数倒序）
 */
export async function getAllFeedback() {
  const { data, error } = await supabase
    .from("feedback")
    .select("*")
    .order("likes", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) { console.error("获取反馈失败:", error.message); return []; }
  return data || [];
}

/**
 * 提交新反馈
 */
export async function addFeedback({ username, content, category }) {
  if (!content?.trim()) return { error: "内容不能为空" };
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const { data, error } = await supabase.from("feedback").insert({
    id,
    username: (username?.trim() || "匿名用户").slice(0, 20),
    content: content.trim().slice(0, 500),
    category: category || "建议",
    likes: 0,
    liked_by: [],
    replies: [],
  }).select().single();
  if (error) { console.error("提交反馈失败:", error.message); return { error: error.message }; }
  return { success: true, feedback: data };
}

/**
 * 回复反馈
 */
export async function replyFeedback({ id, username, content }) {
  if (!id || !content?.trim()) return { error: "回复内容不能为空" };
  // 先获取当前反馈
  const { data: fb } = await supabase.from("feedback").select("replies").eq("id", id).single();
  if (!fb) return { error: "反馈不存在" };
  const reply = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    username: username || "管理员",
    content: content.trim().slice(0, 500),
    createdAt: new Date().toISOString(),
    isAdmin: username === "admin" || username === "管理员",
  };
  const replies = [...(fb.replies || []), reply];
  const { error } = await supabase.from("feedback").update({ replies }).eq("id", id);
  if (error) return { error: error.message };
  return { success: true, reply };
}

/**
 * 点赞/取消点赞
 */
export async function toggleLike({ id, fingerprint }) {
  if (!id || !fingerprint) return { error: "参数缺失" };
  const { data: fb } = await supabase.from("feedback").select("likes,liked_by").eq("id", id).single();
  if (!fb) return { error: "反馈不存在" };
  const likedBy = fb.liked_by || [];
  const idx = likedBy.indexOf(fingerprint);
  let likes = fb.likes || 0;
  if (idx >= 0) { likedBy.splice(idx, 1); likes--; }
  else { likedBy.push(fingerprint); likes++; }
  const { error } = await supabase.from("feedback").update({ likes, liked_by: likedBy }).eq("id", id);
  if (error) return { error: error.message };
  return { success: true, likes, liked: idx < 0 };
}
