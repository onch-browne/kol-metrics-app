import { json, authed, toNum, LABEL } from "../lib/common.mjs";

const get = (o, path) => path.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
const first = (o, paths) => {
  for (const p of paths) { const v = get(o, p); if (v !== undefined && v !== null && v !== "") return v; }
  return null;
};
const num = (o, paths) => {
  for (const p of paths) { const n = toNum(get(o, p)); if (n !== null) return n; }
  return null;
};
const day = (v) => {
  if (v == null) return null;
  const n = Number(v);
  const d = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(v);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
};
const str = (v) => (typeof v === "string" ? v : null);
// fallback: any field that looks like a post date, ignoring scrape metadata
const guessDate = (it) => {
  for (const [k, v] of Object.entries(it)) {
    if (/time|date|created|posted/i.test(k) && !/scrape|crawl|fetch|extract/i.test(k) && day(v)) return day(v);
  }
  return null;
};

// Field names are best guesses with fallbacks. Check them against the first
// raw item the app logs to the browser console and adjust the lists if needed.
const MAP = {
  tiktok: (it) => ({
    handle: str(first(it, ["authorMeta.name", "authorMeta.nickName"])),
    postUrl: str(first(it, ["webVideoUrl", "input"])),
    datePosted: day(first(it, ["createTimeISO", "createTime"])),
    likes: num(it, ["diggCount"]),
    comments: num(it, ["commentCount"]),
    shares: num(it, ["shareCount"]),
  }),
  instagram: (it) => ({
    handle: str(first(it, ["user.username", "owner.username", "ownerUsername", "username"])),
    postUrl: str(first(it, ["url", "post_url", "permalink", "inputUrl", "input_url"]))
      ?? (str(first(it, ["code", "shortcode", "shortCode"]))
        ? `https://www.instagram.com/p/${first(it, ["code", "shortcode", "shortCode"])}/`
        : null),
    datePosted: day(first(it, ["taken_at", "taken_at_timestamp", "timestamp"])),
    likes: num(it, ["like_count", "likes_count", "metrics.like_count"]),
    comments: num(it, ["comment_count", "comments_count", "metrics.comment_count"]),
    shares: num(it, ["repost_count", "metrics.repost_count"]), // IG "shares" = reposts
  }),
  facebook: (it) => ({
    handle: str(first(it, ["pageName", "author.name", "user.name", "author"])),
    postUrl: str(first(it, ["url", "inputUrl"])),
    datePosted: day(first(it, ["timestamp", "time", "date", "publishedTime", "postedAt", "createdTime"])) ?? guessDate(it),
    likes: num(it, ["reactions", "likesCount", "reactionsCount"]),
    comments: num(it, ["comments", "commentsCount"]),
    shares: num(it, ["shares", "sharesCount"]),
  }),
};

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!authed(req)) return json({ error: "Wrong password" }, 401);

  const { runs = [] } = await req.json();
  const headers = { authorization: `Bearer ${process.env.APIFY_TOKEN}` };

  const results = await Promise.all(runs.map(async ({ platform, runId }) => {
    const run = (await (await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, { headers })).json()).data;
    if (!run) return { runId, state: "failed", error: "run not found" };
    if (["READY", "RUNNING"].includes(run.status)) return { runId, state: "running" };
    if (run.status !== "SUCCEEDED") return { runId, state: "failed", error: run.status };

    const items = await (await fetch(
      `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?clean=true`, { headers }
    )).json();
    const rows = items
      .map(MAP[platform])
      .filter((r) => r.likes !== null || r.comments !== null || r.shares !== null)
      .map((r) => ({ ...r, platform: LABEL[platform] }));
    return { runId, state: "done", rows, sample: items[0] ?? null };
  }));

  return json({ results });
};

export const config = { path: "/api/status" };
