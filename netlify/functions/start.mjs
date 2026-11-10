import { json, authed, platformOf, toNum, LABEL, APIFY } from "../lib/common.mjs";

const MAX = Number(process.env.MAX_URLS_PER_PLATFORM || 40);

async function youtube(urls) {
  const ids = urls.map((u) => u.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1]).filter(Boolean);
  if (!ids.length) return [];
  const r = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids.join(",")}&key=${process.env.YT_API_KEY}`
  );
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || "YouTube API error");
  return d.items.map((v) => ({
    handle: v.snippet.channelTitle,
    platform: LABEL.youtube,
    postUrl: `https://www.youtube.com/watch?v=${v.id}`,
    datePosted: v.snippet.publishedAt.slice(0, 10),
    likes: toNum(v.statistics.likeCount),
    comments: toNum(v.statistics.commentCount),
    shares: null, // YouTube doesn't expose shares
  }));
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!authed(req)) return json({ error: "Wrong password" }, 401);

  const { links = [] } = await req.json();
  const groups = { tiktok: [], instagram: [], facebook: [], youtube: [] };
  const skipped = [];
  for (const raw of new Set(links.map((l) => l.trim()).filter(Boolean))) {
    const p = platformOf(raw);
    if (p && groups[p].length < MAX) groups[p].push(raw);
    else skipped.push(raw);
  }

  const runs = [], errors = [];
  for (const [p, cfg] of Object.entries(APIFY)) {
    if (!groups[p].length) continue;
    const r = await fetch(`https://api.apify.com/v2/acts/${cfg.actor}/runs?timeout=600`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.APIFY_TOKEN}` },
      body: JSON.stringify(cfg.input(groups[p])),
    });
    const data = (await r.json()).data;
    if (r.ok && data) runs.push({ platform: p, runId: data.id });
    else errors.push(`${LABEL[p]}: couldn't start the Apify run (check APIFY_TOKEN and credit)`);
  }

  let rows = [];
  try { rows = await youtube(groups.youtube); } catch (e) { errors.push(`YouTube: ${e.message}`); }

  return json({ runs, rows, errors, skipped });
};

export const config = { path: "/api/start" };
