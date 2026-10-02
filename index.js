// Thin viewer: the scan runs in GitHub Actions and commits results.json.
// Set RESULTS_URL as a Worker variable, e.g.
// https://raw.githubusercontent.com/<user>/<repo>/main/results.json

async function loadResults(env) {
  try {
    const res = await fetch(env.RESULTS_URL, {
      cf: { cacheEverything: true, cacheTtl: 300 }, // 1 subrequest, cached 5 min
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const fmt = (iso) =>
  iso ? new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "-";

function renderHtml(payload) {
  // Re-filter at request time so pages that have started drop off between scans.
  const now = new Date();
  const results = (payload?.results || []).filter(
    (r) => r.campaignStartAt && new Date(r.campaignStartAt) > now
  );

  const rows = results
    .map(
      (r) => `<tr>
        <td><a href="${escapeHtml(r.apiUrl)}">${r.id}</a></td>
        <td><a href="${escapeHtml(r.url)}">${escapeHtml(r.title || "(untitled)")}</a></td>
        <td>${escapeHtml(fmt(r.campaignStartAt))}</td>
        <td>${escapeHtml(fmt(r.campaignEndAt))}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>BOOKWALKER - Select Pages Opening in the Future</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 860px; padding: 0 1rem; color: #222; }
  h1 { font-size: 1.4rem; }
  .meta { color: #666; font-size: .85rem; margin-bottom: 1.5rem; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: .6rem .7rem; border-bottom: 1px solid #e2e2e2; vertical-align: top; }
  th { background: #f5f5f5; }
  .empty { padding: 1rem; color: #888; }
  a { color: #0b5cad; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
  <h1>Select Pages that will open in the future</h1>
  <div class="meta">
    Last scan: ${escapeHtml(payload?.generatedAt || "-")} |
    Known pages: ${payload?.knownPages ?? 0} |
    Total future: ${results.length}
    <a href="/api">[JSON]</a>
  </div>
  <table>
    <thead><tr><th>ID</th><th>Title</th><th>Campaign start</th><th>Campaign end</th></tr></thead>
    <tbody>
      ${rows || `<tr><td colspan="4" class="empty">No future select pages found (or results.json is not available yet).</td></tr>`}
    </tbody>
  </table>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const payload = await loadResults(env);

    if (url.pathname === "/api" || url.pathname === "/api/") {
      return new Response(JSON.stringify(payload || { results: [], knownPages: 0 }, null, 2), {
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    return new Response(renderHtml(payload), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  },
};
