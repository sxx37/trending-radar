/**
 * 反馈系统 - Supabase REST API（绕过 SDK bug）
 */
const url = process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_KEY || "";

async function supaGet(path) {
  const resp = await fetch(`${url}${path}`, {
    headers: { "apikey": key, "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
  });
  return resp.json();
}

async function supaPost(path, body) {
  const resp = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "apikey": key, "Authorization": `Bearer ${key}`, "Content-Type": "application/json", "Prefer": "return=representation" },
    body: JSON.stringify(body),
  });
  return resp.json();
}

async function supaPatch(path, body) {
  const resp = await fetch(`${url}${path}`, {
    method: "PATCH",
    headers: { "apikey": key, "Authorization": `Bearer ${key}`, "Content-Type": "application/json", "Prefer": "return=representation" },
    body: JSON.stringify(body),
  });
  return resp.json();
}

/**
 * 获取所有反馈
 */
export async function getAllFeedback() {
  try {
    const data = await supaGet("/rest/v1/feedback?select=*&order=likes.desc,created_at.desc");
    if (data.code) return { items: [], error: data.message };
    return { items: data || [], error: null };
  } catch (e) {
    return { items: [], error: e.message };
  }
}

/**
 * 提交新反馈
 */
export async function addFeedback({ username, content, category }) {
  if (!content?.trim()) return { error: "内容不能为空" };
  const id = String(Date.now()) + String(Math.floor(Math.random() * 100000));
  try {
    const data = await supaPost("/rest/v1/feedback", {
      id,
      username: (username?.trim() || "匿名用户").slice(0, 20),
      content: content.trim().slice(0, 500),
      category: category || "建议",
      likes: 0,
      liked_by: [],
      replies: [],
    });
    if (data.code) return { error: data.message };
    return { success: true, feedback: Array.isArray(data) ? data[0] : data };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * 回复反馈
 */
export async function replyFeedback({ id, username, content }) {
  if (!id || !content?.trim()) return { error: "回复内容不能为空" };
  try {
    const rows = await supaGet(`/rest/v1/feedback?id=eq.${encodeURIComponent(id)}&select=replies`);
    if (!rows?.length) return { error: "反馈不存在" };
    const reply = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      username: username || "管理员",
      content: content.trim().slice(0, 500),
      createdAt: new Date().toISOString(),
      isAdmin: username === "admin" || username === "管理员",
    };
    const replies = [...(rows[0].replies || []), reply];
    await supaPatch(`/rest/v1/feedback?id=eq.${encodeURIComponent(id)}`, { replies });
    return { success: true, reply };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * 点赞/取消点赞
 */
export async function toggleLike({ id, fingerprint }) {
  if (!id || !fingerprint) return { error: "参数缺失" };
  try {
    const rows = await supaGet(`/rest/v1/feedback?id=eq.${encodeURIComponent(id)}&select=likes,liked_by`);
    if (!rows?.length) return { error: "反馈不存在" };
    const fb = rows[0];
    const likedBy = fb.liked_by || [];
    const idx = likedBy.indexOf(fingerprint);
    let likes = fb.likes || 0;
    if (idx >= 0) { likedBy.splice(idx, 1); likes--; }
    else { likedBy.push(fingerprint); likes++; }
    await supaPatch(`/rest/v1/feedback?id=eq.${encodeURIComponent(id)}`, { likes, liked_by: likedBy });
    return { success: true, likes, liked: idx < 0 };
  } catch (e) {
    return { error: e.message };
  }
}
