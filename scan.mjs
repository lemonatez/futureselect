import fs from "fs";

const MIN_ID = 280;
const MAX_ID = 1000;
const CONCURRENCY = 10;
const DELAY_MS = 150;

const API = (id) => `https://bookwalker.in.th/api/select-page/${id}/`;
const headers = {
  Accept: "application/json",
  "Accept-Language": "th,en;q=0.8",
  Referer: "https://bookwalker.in.th/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Returns page object, or null if it doesn't exist. Retries real errors only.
async function get(id, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(API(id), { headers });
      if (r.status === 404 || r.status === 410) return null;
      if (r.ok) {
        const d = (await r.json())?.data;
        return d && d.id ? d : null;
      }
    } catch {}
    await sleep(300 * (i + 1));
  }
  return null;
}

const ids = Array.from({ length: MAX_ID - MIN_ID + 1 }, (_, i) => MIN_ID + i);
const pages = [];
for (let i = 0; i < ids.length; i += CONCURRENCY) {
  const batch = await Promise.all(ids.slice(i, i + CONCURRENCY).map((id) => get(id)));
  pages.push(...batch.filter(Boolean));
  await sleep(DELAY_MS);
}

const now = new Date();
const results = pages
  .filter((p) => p.campaignStartAt && !p.archived && p.isVisible !== false)
  .filter((p) => new Date(p.campaignStartAt) > now)
  .sort((a, b) => new Date(a.campaignStartAt) - new Date(b.campaignStartAt))
  .map((p) => ({
    id: Number(p.id),
    title: p.title,
    url: `https://bookwalker.in.th/select/${p.id}/`,
    apiUrl: API(p.id),
    campaignStartAt: p.campaignStartAt,
    campaignEndAt: p.campaignEndAt,
    startAt: p.startAt,
    endAt: p.endAt,
    categoryCsv: p.categoryCsv,
    imagePc: p.imagePc || null,
    imageSp: p.imageSp || null,
    description: p.description || "",
  }));

const payload = {
  generatedAt: now.toISOString(),
  scannedRange: { min: MIN_ID, max: MAX_ID },
  knownPages: pages.length,
  totalFuture: results.length,
  results,
};

// Safety: if the site blocked us and we found nothing, don't overwrite good data.
if (pages.length === 0) {
  console.error("No pages found; keeping previous results.json");
  process.exit(1);
}

// Only write when the results actually changed, so git history stays quiet.
let previous = null;
try {
  previous = JSON.parse(fs.readFileSync("results.json", "utf8"));
} catch {}

const strip = (p) => JSON.stringify({ r: p?.results, k: p?.knownPages });
if (previous && strip(previous) === strip(payload)) {
  console.log("No changes.");
} else {
  fs.writeFileSync("results.json", JSON.stringify(payload, null, 2));
  console.log(`Wrote ${results.length} future pages (${pages.length} known).`);
}
