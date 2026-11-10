export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

// Fails closed: if APP_PASSWORD isn't set in Netlify, nobody gets in.
export const authed = (req) => {
  const pw = process.env.APP_PASSWORD;
  return !!pw && req.headers.get("x-app-password") === pw;
};

export function platformOf(url) {
  const u = url.toLowerCase();
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("facebook.com") || u.includes("fb.watch") || u.includes("fb.com")) return "facebook";
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  return null;
}

export function toNum(v) {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) || n < 0 ? null : Math.floor(n);
}

export const LABEL = { tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook", youtube: "YouTube" };

// Apify actors (same IG/FB ones as the Python script; TikTok is new)
export const APIFY = {
  tiktok: { actor: "clockworks~tiktok-scraper", input: (urls) => ({ postURLs: urls, resultsPerPage: 1 }) },
  instagram: { actor: "data-slayer~instagram-post-details", input: (urls) => ({ postUrls: urls }) },
  facebook: { actor: "social_developer~facebook-posts-reels-scraper", input: (urls) => ({ urls }) },
};
